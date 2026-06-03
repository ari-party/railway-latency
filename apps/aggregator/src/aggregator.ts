import { Point } from '@influxdata/influxdb-client';
import {
  getEmptyNetworkResultsDictionary,
  getEmptyProbeResults,
} from '@railway-latency/utils';
import ky from 'ky';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { log } from '@/pino';
import { sse } from '@/routes/stream';
import { writeAPI } from '@/services/influxdb';

import type { Batch } from '@/lib/batch-sse';
import type {
  Measurement,
  Network,
  NetworkProbe,
  Probe,
  ProbeMeasurement,
  ProbeResults,
} from '@railway-latency/types';

interface InternalPoint {
  src: string;
  dst: string;
  ms: number;
  time: Date;
}

interface MeasurementMapping {
  key: keyof ProbeMeasurement;
  name: Measurement;
}

const PRIVATE_MEASUREMENTS: MeasurementMapping[] = [
  { key: 'http', name: 'http' },
  { key: 'dns', name: 'dns' },
];
const PUBLIC_MEASUREMENTS: MeasurementMapping[] = [
  { key: 'http', name: 'httpPublic' },
  { key: 'dns', name: 'dnsPublic' },
];
const PROXIED_MEASUREMENTS: MeasurementMapping[] = [
  { key: 'http', name: 'httpProxied' },
  { key: 'dns', name: 'dnsProxied' },
];

interface NetworkConfig {
  network: Network;
  measurements: MeasurementMapping[];
  // When true, write only once per snapshot timestamp (the snapshot refreshes
  // slower than the poll). Without it the same values would be written repeatedly.
  dedup: boolean;
}

const NETWORK_CONFIGS: NetworkConfig[] = [
  { network: 'private', measurements: PRIVATE_MEASUREMENTS, dedup: false },
  { network: 'public', measurements: PUBLIC_MEASUREMENTS, dedup: true },
  { network: 'proxied', measurements: PROXIED_MEASUREMENTS, dedup: true },
];

function extractPoints(
  results: ProbeResults,
  region: string,
  time: Date,
  measurementKey: keyof ProbeMeasurement,
) {
  const points: InternalPoint[] = [];

  for (const [subRegion, measurement] of Object.entries(results)) {
    if (!measurement) continue;

    const value = measurement[measurementKey];
    if (typeof value === 'number')
      points.push({ src: region, dst: subRegion, ms: value, time });
  }

  return points;
}

function writePointsToInflux(
  points: InternalPoint[],
  measurement: Measurement,
) {
  if (points.length === 0) return;

  writeAPI.writePoints(
    points.map((point) =>
      new Point(measurement)
        .tag('src', point.src)
        .tag('dst', point.dst)
        .floatField('ms', point.ms)
        .timestamp(point.time),
    ),
  );
}

function createSSEBatch(
  points: InternalPoint[],
  measurement: Measurement,
): Batch {
  return points.map((point) => [
    `${measurement},${point.time.toISOString()},${Number(Number(point.ms).toFixed(5))}`,
    `${point.src}:${point.dst}`,
  ]) as Batch;
}

function buildNetworkBatch(
  region: string,
  networkProbe: NetworkProbe,
  measurements: MeasurementMapping[],
): Batch {
  const time = new Date(networkProbe.time);
  const batch: Batch = [];

  for (const { key, name } of measurements) {
    const points = extractPoints(networkProbe.results, region, time, key);
    writePointsToInflux(points, name);
    batch.push(...createSSEBatch(points, name));
  }

  return batch;
}

function mergeResults(results: ProbeResults): ProbeResults {
  const base = getEmptyProbeResults(env.RAILWAY_REPLICA_REGIONS);

  for (const [subRegion, measurement] of Object.entries(results)) {
    if (!measurement) continue;

    base[subRegion] = {
      http: measurement.http ?? null,
      dns: measurement.dns ?? null,
    };
  }

  return base;
}

const lastResults = getEmptyNetworkResultsDictionary(
  env.RAILWAY_REPLICA_REGIONS,
);

const lastWriteTime: Record<Network, Record<string, number>> = {
  private: {},
  public: {},
  proxied: {},
};

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

    if (!probe) {
      for (const { network } of NETWORK_CONFIGS)
        lastResults[network][region] = getEmptyProbeResults(
          env.RAILWAY_REPLICA_REGIONS,
        );
      continue;
    }

    const batch: Batch = [];

    for (const { network, measurements, dedup } of NETWORK_CONFIGS) {
      const networkProbe = probe[network];

      if (!dedup || networkProbe.time !== lastWriteTime[network][region]) {
        batch.push(...buildNetworkBatch(region, networkProbe, measurements));
        lastWriteTime[network][region] = networkProbe.time;
      }

      lastResults[network][region] = mergeResults(networkProbe.results);
    }

    sse.batch(batch);
  }
}

// Not calling aggregate immediately here as there were previously timeout errors
const interval = setIntervalAsync(aggregate, 1_000);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => clearIntervalAsync(interval));

export const getLastResults = () => lastResults;
