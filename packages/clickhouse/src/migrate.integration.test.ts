import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { parseCheckQuery } from '@/checkQuery';
import { createCheckEventClient } from '@/client';
import { runMigrations } from '@/migrate';
import { getCheckEventDetail, queryCheckEvents } from '@/query';
import { buildCheckEventRow } from '@/rows';

import type { ClickHouseClient } from '@clickhouse/client';

const url = process.env.CLICKHOUSE_TEST_URL;

describe.skipIf(!url)('check_events migration (live ClickHouse)', () => {
  let client: ClickHouseClient;

  beforeAll(() => {
    client = createCheckEventClient({
      url: url as string,
      username: process.env.CLICKHOUSE_TEST_USER ?? 'default',
      password: process.env.CLICKHOUSE_TEST_PASSWORD ?? '',
      database: process.env.CLICKHOUSE_TEST_DATABASE ?? 'default',
    });
  });

  afterAll(async () => {
    await client?.close();
  });

  it('applies the schema and creates check_events with the expected columns', async () => {
    await runMigrations(client);

    const described = await client.query({
      query: 'DESCRIBE TABLE check_events',
      format: 'JSONEachRow',
    });
    const columns = (await described.json()) as Array<{
      name: string;
      type: string;
    }>;
    const byName = new Map(columns.map((column) => [column.name, column.type]));

    expect(byName.get('headers')).toMatch(/^Map\(/);
    expect(byName.get('http_status')).toBe('Nullable(UInt16)');
    expect(byName.get('body_truncated')).toBe('Bool');
    expect(byName.has('railway_edge')).toBe(true);
  });

  it('is idempotent on a second run', async () => {
    await runMigrations(client);
    await runMigrations(client);

    const applied = await client.query({
      query: 'SELECT count() AS count FROM schema_migrations WHERE version = 1',
      format: 'JSONEachRow',
    });
    const rows = (await applied.json()) as Array<{ count: string }>;
    expect(Number(rows[0].count)).toBe(1);
  });

  it('executes a composite-cursor keyset query against the real schema', async () => {
    await runMigrations(client);

    const rows = await queryCheckEvents(client, {
      query: parseCheckQuery('@network:public @has:body upstream'),
      from: 1_699_000_000_000,
      to: 1_700_000_000_000,
      cursor: {
        time: 1_699_500_000_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      },
      limit: 5,
    });

    expect(Array.isArray(rows)).toBe(true);
  });

  it('returns check event times as numbers from the list and detail queries', async () => {
    await runMigrations(client);
    const time = Date.now() - 60 * 60 * 1_000;
    await client.insert({
      table: 'check_events',
      values: [
        buildCheckEventRow('probe-int64', {
          dst: 'europe-west4',
          network: 'public',
          time,
          headers: {},
        }),
      ],
      format: 'JSONEachRow',
    });

    const [listed] = await queryCheckEvents(client, {
      query: parseCheckQuery('@src:probe-int64'),
      limit: 1,
    });
    const detail = await getCheckEventDetail(client, {
      time,
      src: 'probe-int64',
      dst: 'europe-west4',
      network: 'public',
    });

    expect(listed.time).toBe(time);
    expect(detail?.time).toBe(time);
  });

  it('creates samples, error_events and mtr_events with expected columns', async () => {
    await runMigrations(client);

    for (const table of ['samples', 'error_events', 'mtr_events']) {
      const described = await client.query({
        query: `DESCRIBE TABLE ${table}`,
        format: 'JSONEachRow',
      });
      const columns = (await described.json()) as Array<{
        name: string;
        type: string;
      }>;
      expect(columns.length).toBeGreaterThan(0);
    }

    const samples = await client.query({
      query: 'DESCRIBE TABLE samples',
      format: 'JSONEachRow',
    });
    const sampleColumns = new Map(
      ((await samples.json()) as Array<{ name: string; type: string }>).map(
        (column) => [column.name, column.type],
      ),
    );
    expect(sampleColumns.get('ms')).toBe('Float32');
    expect(sampleColumns.has('network')).toBe(false);
    expect(sampleColumns.get('measurement')).toMatch(/LowCardinality/);
  });
});
