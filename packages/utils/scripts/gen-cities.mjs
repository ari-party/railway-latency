import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'csv-parse/sync';

const SOURCE = 'https://davidmegginson.github.io/ourairports-data/airports.csv';
const KEEP_TYPES = new Set(['large_airport', 'medium_airport']);

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`fetch ${SOURCE}: ${response.status}`);

const rows = parse(await response.text(), {
  columns: true,
  skip_empty_lines: true,
  relax_column_count: true,
});

const round = (value) => Math.round(Number(value) * 1e4) / 1e4;

const byCode = new Map();
for (const row of rows) {
  const code = (row.iata_code ?? '').trim().toLowerCase();
  if (!/^[a-z]{3}$/.test(code)) continue;
  if (!KEEP_TYPES.has(row.type)) continue;

  const label = (row.municipality ?? '').trim();
  if (!label) continue;

  const continent = (row.continent ?? '').trim().toLowerCase();
  if (!/^[a-z]{2}$/.test(continent)) continue;

  const lat = round(row.latitude_deg);
  const lon = round(row.longitude_deg);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

  const previous = byCode.get(code);
  if (previous?.type === 'large_airport' && row.type !== 'large_airport')
    continue;

  byCode.set(code, { code, label, continent, lat, lon, type: row.type });
}

const cities = [...byCode.values()]
  .map(({ type: _type, ...city }) => city)
  .sort(
    (a, b) => a.label.localeCompare(b.label) || a.code.localeCompare(b.code),
  );

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'src',
  'cities.data.json',
);
writeFileSync(
  out,
  `[\n${cities.map((c) => JSON.stringify(c)).join(',\n')}\n]\n`,
);
console.log(`wrote ${cities.length} cities to ${out}`);
