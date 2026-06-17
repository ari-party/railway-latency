import {
  buildCheckEventRow,
  createCheckEventClient,
  insertCheckEvents,
  runMigrations,
} from '@railway-latency/clickhouse';

import { env } from '@/env';
import { log } from '@/pino';

import type { CheckEvent } from '@railway-latency/types';

export const checkEventClient: ReturnType<typeof createCheckEventClient> =
  createCheckEventClient({
    url: env.CLICKHOUSE_URL,
    username: env.CLICKHOUSE_USERNAME,
    password: env.CLICKHOUSE_PASSWORD,
    database: env.CLICKHOUSE_DATABASE,
  });

export async function runStartupMigrations(): Promise<void> {
  await runMigrations(checkEventClient);
}

export function writeChecks(src: string, checks: CheckEvent[]) {
  if (checks.length === 0) return;
  const rows = checks.map((check) => buildCheckEventRow(src, check));
  insertCheckEvents(checkEventClient, rows).catch((error) =>
    log.error(
      { name: 'clickhouse', err: error, rows: rows.length },
      'ClickHouse insert failed',
    ),
  );
}
