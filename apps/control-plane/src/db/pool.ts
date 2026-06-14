import pg from 'pg';

import { env } from '@/env';

export const pool = new pg.Pool({ connectionString: env.DATABASE_URL });

export function query<Row extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  values?: unknown[],
): Promise<pg.QueryResult<Row>> {
  return pool.query<Row>(text, values);
}
