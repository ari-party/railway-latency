import { Point } from '@influxdata/influxdb-client';
import {
  getEmptyProbeResults,
  getEmptyProbeResultsDictionary,
} from '@railway-latency/utils';
import ky from 'ky';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { log } from '@/pino';
import { sse } from '@/routes/stream';
import { writeAPI } from '@/services/influxdb';

import type { Batch } from '@/lib/batch-sse';
import type { Probe, ProbeMeasurement } from '@railway-latency/types';

interface InternalPoint {
  src: string;
  dst: string;
  ms: number;
  time: Date;
}

function extractPoints(
  measurements: Probe['results'],
  region: string,
  time: Date,
  measurementType: keyof ProbeMeasurement,
) {
  const points: InternalPoint[] = [];

  for (const [subRegion, measurement] of Object.entries(measurements)) {
    if (!measurement) continue;

    const value = measurement[measurementType];
    if (typeof value === 'number')
      points.push({
        src: region,
        dst: subRegion,
        ms: value,
        time,
      });
  }

  return points;
}

function writePointsToInflux(
  points: InternalPoint[],
  measurementType: keyof ProbeMeasurement,
) {
  if (points.length === 0) return;

  writeAPI.writePoints(
    points.map((point) =>
      new Point(measurementType)
        .tag('src', point.src)
        .tag('dst', point.dst)
        .floatField('ms', point.ms)
        .timestamp(point.time),
    ),
  );
}

function createSSEBatch(
  points: InternalPoint[],
  measurementType: keyof ProbeMeasurement,
) {
  return points.map((point) => [
    `${measurementType},${point.time.toISOString()},${Number(Number(point.ms).toFixed(5))}`,
    `${point.src}:${point.dst}`,
  ]) as Batch;
}

const lastResults = getEmptyProbeResultsDictionary(env.RAILWAY_REPLICA_REGIONS);

const probeAPIs = Object.fromEntries(
  env.RAILWAY_REPLICA_REGIONS.map((region) => [
    region,
    ky.create({
      prefixUrl: `http://${region}.railway.internal:8080`,
      throwHttpErrors: false,
      timeout: 1_000,
    }),
  ]),
);

async function getRegionProbe(region: string): Promise<Probe | null> {
  const response = await probeAPIs[region].get('probe').catch((err) => {
    log.error(err, `Failed to get probe from ${region}`);
    return null;
  });
  if (!response || !response.ok) return null;

  return response.json<Probe>();
}

async function aggregate() {
  const probeResults = await Promise.allSettled(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionProbe),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const region = env.RAILWAY_REPLICA_REGIONS[i];
    const probeResult = probeResults[i];
    const probe =
      probeResult.status === 'fulfilled' && probeResult.value !== null
        ? probeResult.value
        : null;

    const baseResults = getEmptyProbeResults(env.RAILWAY_REPLICA_REGIONS);

    if (!probe) {
      lastResults[region] = baseResults;
      continue;
    }

    const { time, results: measurements } = probe;
    const probeTime = new Date(time);

    for (const [subRegion, measurement] of Object.entries(measurements)) {
      if (!measurement) continue;

      if (!baseResults[subRegion])
        baseResults[subRegion] = {
          http: null,
          dns: null,
        };

      baseResults[subRegion] = {
        http: measurement.http ?? null,
        dns: measurement.dns ?? null,
      };
    }

    lastResults[region] = baseResults;

    const allBatches: Batch = [];
    for (const measurementType of ['http', 'dns'] as const) {
      const points = extractPoints(
        measurements,
        region,
        probeTime,
        measurementType,
      );
      writePointsToInflux(points, measurementType);
      allBatches.push(...createSSEBatch(points, measurementType));
    }

    sse.batch(allBatches);
  }
}

// Not calling aggregate immediately here as there were previously timeout errors
const interval = setIntervalAsync(aggregate, 1_000);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => clearIntervalAsync(interval));

export const getLastResults = () => lastResults;
