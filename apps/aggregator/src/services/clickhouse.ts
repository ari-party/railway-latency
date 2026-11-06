import {
  buildCheckEventRow,
  buildErrorEventRow,
  buildMtrEventRow,
  buildSampleRow,
  createCheckEventClient,
  insertCheckEvents,
  insertErrorEvents,
  insertMtrEvents,
  insertSamples,
  runMigrations,
} from '@railway-latency/clickhouse';
import { networkForMeasurement } from '@railway-latency/utils';

import { env } from '@/env';
import { log } from '@/pino';

import type {
  ErrorEventRow,
  MtrEventRow,
  SampleRow,
} from '@railway-latency/clickhouse';
import type {
  CheckEvent,
  ErrorEvent,
  ProbeSample,
} from '@railway-latency/types';

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

export function writeSampleRows(src: string, samples: ProbeSample[]) {
  if (samples.length === 0) return;
  const sampleRows: SampleRow[] = [];
  const mtrRows: MtrEventRow[] = [];

  for (const sample of samples) {
    sampleRows.push(buildSampleRow(src, sample, 'internal'));
    if (sample.mtr != null && sample.mtr.length > 0)
      mtrRows.push(
        buildMtrEventRow(
          src,
          sample,
          networkForMeasurement(sample.measurement),
        ),
      );
  }

  insertSamples(checkEventClient, sampleRows).catch((error) =>
    log.error(
      { name: 'clickhouse', err: error, rows: sampleRows.length },
      'ClickHouse sample insert failed',
    ),
  );
  if (mtrRows.length > 0)
    insertMtrEvents(checkEventClient, mtrRows).catch((error) =>
      log.error(
        { name: 'clickhouse', err: error, rows: mtrRows.length },
        'ClickHouse mtr insert failed',
      ),
    );
}

export function writeErrorRows(src: string, errors: ErrorEvent[]) {
  if (errors.length === 0) return;
  const rows: ErrorEventRow[] = errors.map((event) =>
    buildErrorEventRow(src, event, 'internal'),
  );
  insertErrorEvents(checkEventClient, rows).catch((error) =>
    log.error(
      { name: 'clickhouse', err: error, rows: rows.length },
      'ClickHouse error insert failed',
    ),
  );
}
