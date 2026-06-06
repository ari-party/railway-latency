import { Point } from '@influxdata/influxdb-client';
import { getEmptyNetworkResultsDictionary } from '@railway-latency/utils';
import ky from 'ky';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { log } from '@/pino';
import { writeAPI } from '@/services/influxdb';

import type {
  ErrorEvent,
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

async function getRegionErrors(region: string): Promise<ErrorEvent[]> {
  const response = await probeAPIs[region].get('errors').catch((err) => {
    log.error(err, `Failed to get errors from ${region}`);
    return null;
  });
  if (!response || !response.ok) return [];

  return response.json<ErrorEvent[]>();
}

function writeSamples(src: string, samples: ProbeSample[]) {
  const points: Point[] = [];

  for (const sample of samples) {
    points.push(
      new Point(sample.measurement)
        .tag('src', src)
        .tag('dst', sample.dst)
        .floatField('ms', sample.ms)
        .timestamp(new Date(sample.time)),
    );

    const { net, type } = MEASUREMENT_INFO[sample.measurement];
    const srcResults = lastResults[net][src];
    if (!srcResults[sample.dst])
      srcResults[sample.dst] = { http: null, dns: null, handshake: null };
    srcResults[sample.dst][type] = sample.ms;
  }

  if (points.length > 0) writeAPI.writePoints(points);
}

function writeErrors(src: string, errors: ErrorEvent[]) {
  if (errors.length === 0) return;

  writeAPI.writePoints(
    errors.map((event) =>
      new Point('error')
        .tag('src', src)
        .tag('dst', event.dst)
        .tag('network', event.network)
        .stringField('reason', event.reason)
        .timestamp(new Date(event.time)),
    ),
  );
}

async function aggregateSamples() {
  const settled = await Promise.allSettled(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionSamples),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const result = settled[i];
    if (result.status === 'fulfilled')
      writeSamples(env.RAILWAY_REPLICA_REGIONS[i], result.value);
  }
}

async function aggregateErrors() {
  const settled = await Promise.allSettled(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionErrors),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const result = settled[i];
    if (result.status === 'fulfilled')
      writeErrors(env.RAILWAY_REPLICA_REGIONS[i], result.value);
  }
}

const intervals = [
  setIntervalAsync(aggregateSamples, 1_000),
  setIntervalAsync(aggregateErrors, 1_000),
];

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => {
    for (const interval of intervals) clearIntervalAsync(interval);
  });

export const getLastResults = () => lastResults;
