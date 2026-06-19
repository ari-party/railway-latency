/* eslint-disable no-underscore-dangle -- InfluxDB exposes _time/_value columns */
import { InfluxDB } from '@influxdata/influxdb-client';
import {
  buildSampleRow,
  buildErrorEventRow,
  buildMtrEventRow,
  createCheckEventClient,
  insertSamples,
  insertErrorEvents,
  insertMtrEvents,
} from '@railway-latency/clickhouse';
import { MEASUREMENT_INFO } from '@railway-latency/utils';

import { env } from '@/env';

import type { Measurement, Network, ProbeSample } from '@railway-latency/types';

const SAMPLE_MEASUREMENTS = Object.keys(MEASUREMENT_INFO) as Measurement[];
const DAY_MS = 24 * 60 * 60 * 1_000;
const BACKFILL_WINDOW_MS = 30 * DAY_MS;

const influxUrl = process.env.INFLUXDB_URL;
const influxToken = process.env.INFLUXDB_TOKEN;
const influxOrg = process.env.INFLUXDB_ORG;
const influxBucket = process.env.INFLUXDB_BUCKET;
if (!influxUrl || !influxToken || !influxOrg || !influxBucket)
  throw new Error(
    'INFLUXDB_URL/TOKEN/ORG/BUCKET must be present (they remain set on the Railway service until Influx is decommissioned)',
  );

const queryApi = new InfluxDB({
  url: influxUrl,
  token: influxToken,
}).getQueryApi(influxOrg);
const clickhouse = createCheckEventClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USERNAME,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DATABASE,
});

async function resolveBoundaryMs(): Promise<number> {
  const result = await clickhouse.query({
    query:
      'SELECT toUnixTimestamp64Milli(min(time)) AS minMs, count() AS rowCount FROM samples',
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  const [first] = (await result.json()) as Array<{
    minMs: number;
    rowCount: number;
  }>;
  if (!first || first.rowCount === 0) return Date.now();
  return first.minMs;
}

function isoRange(
  fromMs: number,
  toMs: number,
): { start: string; stop: string } {
  return {
    start: new Date(fromMs).toISOString(),
    stop: new Date(toMs).toISOString(),
  };
}

async function backfillSamplesForDay(
  measurement: Measurement,
  fromMs: number,
  toMs: number,
) {
  const { start, stop } = isoRange(fromMs, toMs);
  const flux = `from(bucket: "${influxBucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r._measurement == "${measurement}")
    |> pivot(rowKey: ["_time", "src", "dst"], columnKey: ["_field"], valueColumn: "_value")`;

  const rows = [];
  for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
    const record = tableMeta.toObject(values) as Record<string, unknown>;
    if (record.ms == null) continue;
    const sample: ProbeSample = {
      measurement,
      dst: String(record.dst),
      time: Date.parse(String(record._time)),
      ms: Number(record.ms),
      railwayEdge:
        record.railway_edge == null ? undefined : String(record.railway_edge),
      cfPop: record.cf_pop == null ? undefined : String(record.cf_pop),
      hikariPop:
        record.hikari_pop == null ? undefined : String(record.hikari_pop),
    };
    const origin = record.origin == null ? '' : String(record.origin);
    rows.push(buildSampleRow(String(record.src), sample, origin));
  }
  await insertSamples(clickhouse, rows);
  console.log(`samples ${measurement} ${start}: ${rows.length}`);
}

async function backfillMtrForDay(fromMs: number, toMs: number) {
  const { start, stop } = isoRange(fromMs, toMs);
  const flux = `from(bucket: "${influxBucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r._measurement == "mtr" and r._field == "hops")`;
  const rows = [];
  for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
    const record = tableMeta.toObject(values) as Record<string, unknown>;
    rows.push(
      buildMtrEventRow(
        String(record.src),
        {
          measurement: 'httpPublic',
          dst: String(record.dst),
          time: Date.parse(String(record._time)),
          ms: 0,
          mtr: JSON.parse(String(record._value)),
        },
        String(record.network),
      ),
    );
  }
  await insertMtrEvents(clickhouse, rows);
  console.log(`mtr ${start}: ${rows.length}`);
}

async function backfillErrorsForDay(fromMs: number, toMs: number) {
  const { start, stop } = isoRange(fromMs, toMs);
  const flux = `from(bucket: "${influxBucket}")
    |> range(start: ${start}, stop: ${stop})
    |> filter(fn: (r) => r._measurement == "error" and r._field == "reason")`;
  const rows = [];
  for await (const { values, tableMeta } of queryApi.iterateRows(flux)) {
    const record = tableMeta.toObject(values) as Record<string, unknown>;
    rows.push(
      buildErrorEventRow(
        String(record.src),
        {
          dst: String(record.dst),
          network: String(record.network) as Network,
          time: Date.parse(String(record._time)),
          reason: String(record._value),
        },
        record.origin == null ? '' : String(record.origin),
      ),
    );
  }
  await insertErrorEvents(clickhouse, rows);
  console.log(`errors ${start}: ${rows.length}`);
}

async function main() {
  const boundaryMs = await resolveBoundaryMs();
  const startMs = boundaryMs - BACKFILL_WINDOW_MS;
  console.log(
    `backfilling Influx time < ${new Date(boundaryMs).toISOString()}`,
  );

  for (let dayStart = startMs; dayStart < boundaryMs; dayStart += DAY_MS) {
    const dayEnd = Math.min(dayStart + DAY_MS, boundaryMs);
    for (const measurement of SAMPLE_MEASUREMENTS)
      await backfillSamplesForDay(measurement, dayStart, dayEnd);
    await backfillMtrForDay(dayStart, dayEnd);
    await backfillErrorsForDay(dayStart, dayEnd);
  }

  await clickhouse.close();
  console.log('backfill complete');
}

await main();
