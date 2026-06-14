import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { pool } from '@/db/pool';
import { log } from '@/pino';

const migrationsDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  'migrations',
);

interface Migration {
  version: number;
  fileName: string;
  sql: string;
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

export async function runMigrations() {
  await pool.query(
    `create table if not exists schema_migrations (
       version int primary key,
       applied_at timestamptz not null default now()
     )`,
  );

  const applied = await pool.query<{ version: number }>(
    'select version from schema_migrations',
  );

  const appliedVersions = new Set(applied.rows.map((row) => row.version));

  for (const migration of loadMigrations()) {
    if (appliedVersions.has(migration.version)) continue;

    const client = await pool.connect();
    try {
      await client.query('begin');
      await client.query(migration.sql);
      await client.query(
        'insert into schema_migrations (version) values ($1)',
        [migration.version],
      );
      await client.query('commit');
      log.info({ version: migration.version }, 'applied migration');
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}
