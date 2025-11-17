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
import type { Probe } from '@railway-latency/types';

interface InternalPoint {
  src: string;
  dst: string;
  ms: number;
  time: Date;
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

    const httpPoints: InternalPoint[] = [];
    const dnsPoints: InternalPoint[] = [];

    for (const [subRegion, measurement] of Object.entries(measurements)) {
      if (!measurement) continue;

      if (measurement.http !== null && measurement.http !== undefined)
        httpPoints.push({
          src: region,
          dst: subRegion,
          ms: measurement.http,
          time: new Date(time),
        });

      if (measurement.dns !== null && measurement.dns !== undefined)
        dnsPoints.push({
          src: region,
          dst: subRegion,
          ms: measurement.dns,
          time: new Date(time),
        });
    }

    if (httpPoints.length > 0)
      writeAPI.writePoints(
        httpPoints.map((internalPoint) =>
          new Point('http')
            .tag('src', internalPoint.src)
            .tag('dst', internalPoint.dst)
            .floatField('ms', internalPoint.ms)
            .timestamp(internalPoint.time),
        ),
      );
    if (dnsPoints.length > 0)
      writeAPI.writePoints(
        dnsPoints.map((internalPoint) =>
          new Point('dns')
            .tag('src', internalPoint.src)
            .tag('dst', internalPoint.dst)
            .floatField('ms', internalPoint.ms)
            .timestamp(internalPoint.time),
        ),
      );

    sse.batch([
      ...(httpPoints.map((internalPoint) => [
        `http,${internalPoint.time.toISOString()},${Number(Number(internalPoint.ms).toFixed(5))}`,
        `${internalPoint.src}:${internalPoint.dst}`,
      ]) as Batch),
      ...(dnsPoints.map((internalPoint) => [
        `dns,${internalPoint.time.toISOString()},${Number(Number(internalPoint.ms).toFixed(5))}`,
        `${internalPoint.src}:${internalPoint.dst}`,
      ]) as Batch),
    ]);
  }
}

// Not calling aggregate immediately here as there were previously timeout errors
const interval = setIntervalAsync(aggregate, 1_000);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => clearIntervalAsync(interval));

export const getLastResults = () => lastResults;
