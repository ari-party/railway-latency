import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { ClickHouseClient } from '@clickhouse/client';

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

const SCHEMA_MIGRATIONS_TABLE = 'schema_migrations';

interface Migration {
  version: number;
  fileName: string;
  sql: string;
}

export function splitStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let index = 0;
  while (index < sql.length) {
    const character = sql[index];
    const next = sql[index + 1];
    if (character === '-' && next === '-') {
      while (index < sql.length && sql[index] !== '\n') index += 1;
      continue;
    }
    if (character === '/' && next === '*') {
      index += 2;
      while (
        index < sql.length &&
        !(sql[index] === '*' && sql[index + 1] === '/')
      )
        index += 1;
      index += 2;
      continue;
    }
    if (character === "'" || character === '"' || character === '`') {
      const quote = character;
      current += character;
      index += 1;
      while (index < sql.length) {
        if (sql[index] === '\\') {
          current += sql[index] + (sql[index + 1] ?? '');
          index += 2;
          continue;
        }
        current += sql[index];
        if (sql[index] === quote) {
          index += 1;
          break;
        }
        index += 1;
      }
      continue;
    }
    if (character === ';') {
      const trimmed = current.trim();
      if (trimmed.length > 0) statements.push(trimmed);
      current = '';
      index += 1;
      continue;
    }
    current += character;
    index += 1;
  }
  const trailing = current.trim();
  if (trailing.length > 0) statements.push(trailing);
  return statements;
}

function loadMigrations(): Migration[] {
  return readdirSync(migrationsDirectory)
    .filter((fileName) => fileName.endsWith('.sql'))
    .map((fileName) => {
      const version = parseInt(fileName.split('_')[0], 10);
      if (Number.isNaN(version))
        throw new Error(`migration file is not numbered: ${fileName}`);
      return {
        version,
        fileName,
        sql: readFileSync(join(migrationsDirectory, fileName), 'utf8'),
      };
    })
    .sort((left, right) => left.version - right.version);
}

export async function runMigrations(client: ClickHouseClient): Promise<void> {
  await client.command({
    query: `CREATE TABLE IF NOT EXISTS ${SCHEMA_MIGRATIONS_TABLE} (
      version UInt32, applied_at DateTime DEFAULT now()
    ) ENGINE = MergeTree ORDER BY version`,
  });

  const appliedResult = await client.query({
    query: `SELECT version FROM ${SCHEMA_MIGRATIONS_TABLE}`,
    format: 'JSONEachRow',
  });
  const appliedRows = (await appliedResult.json()) as Array<{
    version: number;
  }>;
  const appliedVersions = new Set(appliedRows.map((row) => row.version));

  for (const migration of loadMigrations()) {
    if (appliedVersions.has(migration.version)) continue;
    for (const statement of splitStatements(migration.sql)) {
      await client.command({ query: statement });
    }
    await client.insert({
      table: SCHEMA_MIGRATIONS_TABLE,
      values: [{ version: migration.version }],
      format: 'JSONEachRow',
    });
  }
}
