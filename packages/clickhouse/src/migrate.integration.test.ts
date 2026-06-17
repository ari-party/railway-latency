import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createCheckEventClient } from '@/client';
import { runMigrations } from '@/migrate';
import { queryCheckEvents } from '@/query';

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
      filters: { network: 'public', hasBody: true, text: 'upstream' },
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
});
