import {
  getEmptyNetworkResultsDictionary,
  MEASUREMENT_INFO,
} from '@railway-latency/utils';
import ky from 'ky';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { log } from '@/pino';
import {
  writeChecks,
  writeErrorRows,
  writeSampleRows,
} from '@/services/clickhouse';

import type {
  CheckEvent,
  ErrorEvent,
  ProbeSample,
} from '@railway-latency/types';

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
  for (const sample of samples) {
    const { net, type } = MEASUREMENT_INFO[sample.measurement];
    const srcResults = lastResults[net][src];
    if (!srcResults[sample.dst])
      srcResults[sample.dst] = { http: null, dns: null, handshake: null };
    srcResults[sample.dst][type] = sample.ms;
  }

  writeSampleRows(src, samples);
}

function writeErrors(src: string, errors: ErrorEvent[]) {
  writeErrorRows(src, errors);
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

async function getRegionChecks(region: string): Promise<CheckEvent[]> {
  const response = await probeAPIs[region].get('checks').catch((err) => {
    log.error(err, `Failed to get checks from ${region}`);
    return null;
  });
  if (!response || !response.ok) return [];

  return response.json<CheckEvent[]>();
}

async function aggregateChecks() {
  const settled = await Promise.allSettled(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionChecks),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const result = settled[i];
    if (result.status === 'fulfilled')
      writeChecks(env.RAILWAY_REPLICA_REGIONS[i], result.value);
  }
}

const intervals = [
  setIntervalAsync(aggregateSamples, 1_000),
  setIntervalAsync(aggregateErrors, 1_000),
  setIntervalAsync(aggregateChecks, 1_000),
];

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => {
    for (const interval of intervals) clearIntervalAsync(interval);
  });

export const getLastResults = () => lastResults;

export { writeSamples, writeErrors };
