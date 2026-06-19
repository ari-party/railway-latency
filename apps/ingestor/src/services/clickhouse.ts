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
} from '@railway-latency/clickhouse';
import {
  EXTERNAL_MEASUREMENTS,
  networkForMeasurement,
} from '@railway-latency/utils';

import { env } from '@/env';
import { log } from '@/pino';
import { isTrustedDestination, withinTimeWindow } from '@/services/guards';

import type { RosterProbe } from '@/types';
import type {
  CheckEventRow,
  ErrorEventRow,
  MtrEventRow,
  SampleRow,
} from '@railway-latency/clickhouse';
import type {
  CheckEvent,
  ErrorEvent,
  ProbeSample,
} from '@railway-latency/types';

const client = createCheckEventClient({
  url: env.CLICKHOUSE_URL,
  username: env.CLICKHOUSE_USERNAME,
  password: env.CLICKHOUSE_PASSWORD,
  database: env.CLICKHOUSE_DATABASE,
});

export function writeExternalChecks(probe: RosterProbe, checks: CheckEvent[]) {
  const now = Date.now();
  const rows: CheckEventRow[] = [];
  let droppedUntrustedDestinations = 0;

  for (const check of checks) {
    if (check.network === 'private') continue;
    if (!withinTimeWindow(check.time, now)) continue;
    if (!isTrustedDestination(check.dst)) {
      droppedUntrustedDestinations += 1;
      continue;
    }
    rows.push(buildCheckEventRow(probe.probeId, check));
  }

  if (droppedUntrustedDestinations > 0)
    log.warn(
      {
        name: 'clickhouse',
        probeId: probe.probeId,
        droppedUntrustedDestinations,
      },
      'Dropped check events for untrusted destinations',
    );

  if (rows.length > 0)
    insertCheckEvents(client, rows).catch((error) =>
      log.error(
        { name: 'clickhouse', err: error, rows: rows.length },
        'ClickHouse insert failed',
      ),
    );
}

const MAX_SAMPLE_MS = 10 * 60 * 1_000;

function isSaneDuration(ms: number): boolean {
  return Number.isFinite(ms) && ms >= 0 && ms <= MAX_SAMPLE_MS;
}

export function writeExternalSamples(
  probe: RosterProbe,
  samples: ProbeSample[],
) {
  const now = Date.now();
  const sampleRows: SampleRow[] = [];
  const mtrRows: MtrEventRow[] = [];
  let droppedUntrustedDestinations = 0;
  let droppedOutOfRangeDurations = 0;

  for (const sample of samples) {
    if (!EXTERNAL_MEASUREMENTS.has(sample.measurement)) continue;
    if (!withinTimeWindow(sample.time, now)) continue;
    if (!isTrustedDestination(sample.dst)) {
      droppedUntrustedDestinations += 1;
      continue;
    }
    if (!isSaneDuration(sample.ms)) {
      droppedOutOfRangeDurations += 1;
      continue;
    }

    sampleRows.push(buildSampleRow(probe.probeId, sample, 'external'));
    if (sample.mtr != null && sample.mtr.length > 0)
      mtrRows.push(
        buildMtrEventRow(
          probe.probeId,
          sample,
          networkForMeasurement(sample.measurement),
        ),
      );
  }

  if (droppedUntrustedDestinations > 0)
    log.warn(
      {
        name: 'clickhouse',
        probeId: probe.probeId,
        dropped: droppedUntrustedDestinations,
      },
      'Dropped samples with untrusted dst',
    );

  if (droppedOutOfRangeDurations > 0)
    log.warn(
      {
        name: 'clickhouse',
        probeId: probe.probeId,
        dropped: droppedOutOfRangeDurations,
      },
      'Dropped samples with out-of-range ms',
    );

  if (sampleRows.length > 0)
    insertSamples(client, sampleRows).catch((error) =>
      log.error(
        { name: 'clickhouse', err: error, rows: sampleRows.length },
        'ClickHouse external sample insert failed',
      ),
    );
  if (mtrRows.length > 0)
    insertMtrEvents(client, mtrRows).catch((error) =>
      log.error(
        { name: 'clickhouse', err: error, rows: mtrRows.length },
        'ClickHouse external mtr insert failed',
      ),
    );
}

export function writeExternalErrors(probe: RosterProbe, errors: ErrorEvent[]) {
  const now = Date.now();
  const rows: ErrorEventRow[] = [];
  let droppedUntrustedDestinations = 0;

  for (const error of errors) {
    if (error.network === 'private') continue;
    if (!withinTimeWindow(error.time, now)) continue;
    if (!isTrustedDestination(error.dst)) {
      droppedUntrustedDestinations += 1;
      continue;
    }
    rows.push(buildErrorEventRow(probe.probeId, error, 'external'));
  }

  if (droppedUntrustedDestinations > 0)
    log.warn(
      {
        name: 'clickhouse',
        probeId: probe.probeId,
        dropped: droppedUntrustedDestinations,
      },
      'Dropped errors with untrusted dst',
    );

  if (rows.length > 0)
    insertErrorEvents(client, rows).catch((insertError) =>
      log.error(
        { name: 'clickhouse', err: insertError, rows: rows.length },
        'ClickHouse external error insert failed',
      ),
    );
}
