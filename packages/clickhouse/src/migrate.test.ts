import { describe, expect, it, vi } from 'vitest';

import { runMigrations, splitStatements } from '@/migrate';

import type { ClickHouseClient } from '@clickhouse/client';

describe('splitStatements', () => {
  it('splits on semicolons and drops comments and blanks', () => {
    const sql = `-- comment\nCREATE TABLE a (x Int32) ENGINE = Memory;\n\nCREATE TABLE b (y Int32) ENGINE = Memory;\n`;
    expect(splitStatements(sql)).toEqual([
      'CREATE TABLE a (x Int32) ENGINE = Memory',
      'CREATE TABLE b (y Int32) ENGINE = Memory',
    ]);
  });

  it('keeps a semicolon inside a quoted default as one statement', () => {
    const sql = "CREATE TABLE t (s String DEFAULT 'a;b') ENGINE = Memory;";
    expect(splitStatements(sql)).toEqual([
      "CREATE TABLE t (s String DEFAULT 'a;b') ENGINE = Memory",
    ]);
  });

  it('strips an inline -- comment and ignores its semicolon', () => {
    const sql =
      'CREATE TABLE t (x Int32) ENGINE = Memory; -- note; ignore\nSELECT 1;';
    expect(splitStatements(sql)).toEqual([
      'CREATE TABLE t (x Int32) ENGINE = Memory',
      'SELECT 1',
    ]);
  });

  it('does not split inside a block comment', () => {
    const sql = 'CREATE TABLE t (x Int32) /* a; b */ ENGINE = Memory;';
    const statements = splitStatements(sql);
    expect(statements).toHaveLength(1);
    expect(statements[0].replace(/\s+/g, ' ')).toBe(
      'CREATE TABLE t (x Int32) ENGINE = Memory',
    );
  });

  it('accepts a final statement without a trailing semicolon', () => {
    expect(splitStatements('SELECT 1')).toEqual(['SELECT 1']);
  });
});

describe('runMigrations', () => {
  it('creates the ledger, applies unapplied files in order, and records versions', async () => {
    const applied = new Set<number>();
    const commands: string[] = [];
    const client = {
      command: vi.fn(async ({ query }: { query: string }) => {
        commands.push(query);
      }),
      query: vi.fn(async () => ({
        json: async () =>
          applied.size === 0
            ? []
            : [...applied].map((version) => ({ version })),
      })),
      insert: vi.fn(
        async ({ values }: { values: Array<{ version: number }> }) => {
          values.forEach((value) => applied.add(value.version));
        },
      ),
    } as unknown as ClickHouseClient;

    await runMigrations(client);

    expect(commands.some((query) => query.includes('schema_migrations'))).toBe(
      true,
    );
    expect(commands.some((query) => query.includes('check_events'))).toBe(true);
    expect(applied.has(1)).toBe(true);

    commands.length = 0;
    await runMigrations(client);
    expect(commands.some((query) => query.includes('check_events'))).toBe(
      false,
    );
  });
});
