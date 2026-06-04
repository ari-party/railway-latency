import { Point } from '@influxdata/influxdb-client';
import { getEmptyNetworkResultsDictionary } from '@railway-latency/utils';
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
  ProbeMeasurement,
  ProbeSample,
} from '@railway-latency/types';

const MEASUREMENT_INFO: Record<
  Measurement,
  { net: Network; type: keyof ProbeMeasurement }
> = {
  http: { net: 'private', type: 'http' },
  dns: { net: 'private', type: 'dns' },
  handshake: { net: 'private', type: 'handshake' },
  httpPublic: { net: 'public', type: 'http' },
  httpPublicHikari: { net: 'public', type: 'http' },
  dnsPublic: { net: 'public', type: 'dns' },
  handshakePublic: { net: 'public', type: 'handshake' },
  httpProxied: { net: 'proxied', type: 'http' },
  httpProxiedHikari: { net: 'proxied', type: 'http' },
  dnsProxied: { net: 'proxied', type: 'dns' },
  handshakeProxied: { net: 'proxied', type: 'handshake' },
};

const lastResults = getEmptyNetworkResultsDictionary(
  env.RAILWAY_REPLICA_REGIONS,
);

const probeAPIs = Object.fromEntries(
  env.RAILWAY_REPLICA_REGIONS.map((region) => [
    region,
    ky.create({
      prefixUrl: `http://${region}.railway.internal:8080`,
      throwHttpErrors: false,
      timeout: 5_000,
    }),
  ]),
);

async function getRegionSamples(region: string): Promise<ProbeSample[]> {
  const response = await probeAPIs[region].get('samples').catch((err) => {
    log.error(err, `Failed to get samples from ${region}`);
    return null;
  });
  if (!response || !response.ok) return [];

  return response.json<ProbeSample[]>();
}

async function aggregate() {
  const settled = await Promise.allSettled(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionSamples),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const src = env.RAILWAY_REPLICA_REGIONS[i];
    const result = settled[i];
    const samples = result.status === 'fulfilled' ? result.value : [];
    if (samples.length === 0) continue;

    const points: Point[] = [];
    const batch: Batch = [];

    for (const sample of samples) {
      const time = new Date(sample.time);

      points.push(
        new Point(sample.measurement)
          .tag('src', src)
          .tag('dst', sample.dst)
          .floatField('ms', sample.ms)
          .timestamp(time),
      );
      batch.push([
        `${sample.measurement},${time.toISOString()},${Number(sample.ms.toFixed(5))}`,
        `${src}:${sample.dst}`,
      ]);

      const { net, type } = MEASUREMENT_INFO[sample.measurement];
      const srcResults = lastResults[net][src];
      if (!srcResults[sample.dst])
        srcResults[sample.dst] = { http: null, dns: null, handshake: null };
      srcResults[sample.dst][type] = sample.ms;
    }

    if (points.length > 0) writeAPI.writePoints(points);
    sse.batch(batch);
  }
}

const interval = setIntervalAsync(aggregate, 1_000);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => clearIntervalAsync(interval));

export const getLastResults = () => lastResults;
