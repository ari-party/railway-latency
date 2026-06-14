import {
  EXTERNAL_MEASUREMENTS,
  buildErrorPoint,
  buildSamplePoint,
  createWriteApi,
} from '@railway-latency/influx';

import { env } from '@/env';
import { log } from '@/pino';

import type { RosterProbe } from '@/types';
import type { Point } from '@influxdata/influxdb-client';
import type { ErrorEvent, ProbeSample } from '@railway-latency/types';

const writeApi = createWriteApi({
  url: env.INFLUXDB_URL,
  token: env.INFLUXDB_TOKEN,
  org: env.INFLUXDB_ORG,
  bucket: env.INFLUXDB_BUCKET,
  writeOptions: {
    // Caps the fire-and-forget buffer so a sustained outage discards at a known bound.
    batchSize: 1_000,
    flushInterval: 5 * 1_000,
    maxRetries: 3,
    maxBufferLines: 30_000,
    writeFailed(error, lines, attempt) {
      log.error(
        { name: 'influxdb', err: error, lines: lines.length, attempt },
        'InfluxDB write failed',
      );
    },
  },
});

export function closeWriteApi(): Promise<void> {
  return writeApi.close();
}

const trustedRegionSlugs = new Set(env.RAILWAY_REPLICA_REGIONS);

if (trustedRegionSlugs.size === 0)
  log.warn(
    { name: 'influxdb' },
    'RAILWAY_REPLICA_REGIONS is empty; every destination is rejected until it is set',
  );

const MAX_SAMPLE_MS = 10 * 60 * 1_000;

function isTrustedDestination(destination: string): boolean {
  return trustedRegionSlugs.has(destination);
}

function isSaneDuration(ms: number): boolean {
  return Number.isFinite(ms) && ms >= 0 && ms <= MAX_SAMPLE_MS;
}

function withinTimeWindow(time: number, now: number): boolean {
  if (time > now + env.MAX_FUTURE_SKEW_MS) return false;
  if (time < now - env.BUFFER_RETENTION_MS) return false;
  return true;
}

export function writeExternalSamples(
  probe: RosterProbe,
  samples: ProbeSample[],
) {
  const now = Date.now();
  const points: Point[] = [];
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

    const point = buildSamplePoint(probe.probeId, sample);
    point.tag('origin', 'external');
    points.push(point);
  }

  if (droppedUntrustedDestinations > 0)
    log.warn(
      {
        name: 'influxdb',
        probeId: probe.probeId,
        dropped: droppedUntrustedDestinations,
      },
      'Dropped samples with untrusted dst',
    );

  if (droppedOutOfRangeDurations > 0)
    log.warn(
      {
        name: 'influxdb',
        probeId: probe.probeId,
        dropped: droppedOutOfRangeDurations,
      },
      'Dropped samples with out-of-range ms',
    );

  if (points.length > 0) writeApi.writePoints(points);
}

export function writeExternalErrors(probe: RosterProbe, errors: ErrorEvent[]) {
  const now = Date.now();
  const points: Point[] = [];
  let droppedUntrustedDestinations = 0;

  for (const error of errors) {
    if (error.network === 'private') continue;
    if (!withinTimeWindow(error.time, now)) continue;
    if (!isTrustedDestination(error.dst)) {
      droppedUntrustedDestinations += 1;
      continue;
    }

    const point = buildErrorPoint(probe.probeId, error);
    point.tag('origin', 'external');
    points.push(point);
  }

  if (droppedUntrustedDestinations > 0)
    log.warn(
      {
        name: 'influxdb',
        probeId: probe.probeId,
        dropped: droppedUntrustedDestinations,
      },
      'Dropped errors with untrusted dst',
    );

  if (points.length > 0) writeApi.writePoints(points);
}
