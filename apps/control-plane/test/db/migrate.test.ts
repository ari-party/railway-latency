import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { runMigrations } from '@/db/migrate';

describe('migration runner', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('creates all tables and records the version ledger', async () => {
    await runMigrations();

    const tables = await testPool.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`,
    );
    const names = tables.rows.map((row) => row.table_name);
    expect(names).toEqual(
      expect.arrayContaining([
        'admin_keys',
        'enrollment_tokens',
        'events',
        'probes',
        'schema_migrations',
      ]),
    );

    const ledger = await testPool.query<{ version: number }>(
      'select version from schema_migrations order by version',
    );
    expect(ledger.rows.map((row) => row.version)).toEqual([1, 2, 3]);
  });

  it('is idempotent on a second run', async () => {
    await runMigrations();
    await runMigrations();

    const ledger = await testPool.query<{ count: string }>(
      'select count(*)::text as count from schema_migrations',
    );
    expect(ledger.rows[0].count).toBe('3');
  });
});
