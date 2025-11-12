import dns from 'node:dns/promises';

import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';

import type { Results } from '@railway-latency/types';

const targetRegions = env.RAILWAY_REPLICA_REGIONS.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);

const lastHttpResults: Results = Object.fromEntries(
  targetRegions.map((region) => [region, null]),
);
const lastDnsResults: Results = Object.fromEntries(
  targetRegions.map((region) => [region, null]),
);

async function measureHttpToRegion(region: string) {
  const start = performance.now();

  const response = await fetch(`http://${region}.railway.internal:8080/`, {
    signal: AbortSignal.timeout(30 * 1_000),
  }).catch(() => null);
  if (!response || !response.ok) return null;

  return performance.now() - start;
}

async function measureAllHttp() {
  const httpMeasurements = await Promise.allSettled(
    targetRegions.map(measureHttpToRegion),
  );

  for (let i = 0; i < targetRegions.length; i += 1) {
    const latency = httpMeasurements[i];
    if (latency.status === 'fulfilled')
      lastHttpResults[targetRegions[i]] = latency.value;
    else lastHttpResults[targetRegions[i]] = null;
  }
}

async function measureDnsToRegion(region: string) {
  const start = performance.now();

  const success = await dns
    .lookup(`${region}.railway.internal`, { all: true })
    .then(() => true)
    .catch(() => false);
  if (!success) return null;

  return performance.now() - start;
}

async function measureAllDns() {
  const dnsMeasurements = await Promise.allSettled(
    targetRegions.map(measureDnsToRegion),
  );

  for (let i = 0; i < targetRegions.length; i += 1) {
    const latency = dnsMeasurements[i];
    if (latency.status === 'fulfilled')
      lastDnsResults[targetRegions[i]] = latency.value;
    else lastDnsResults[targetRegions[i]] = null;
  }
}

async function measureAll() {
  await Promise.all([measureAllHttp(), measureAllDns()]);
}

measureAll().finally(() => {
  setIntervalAsync(measureAll, 1_000);
});

export const getLastResults = () => [lastHttpResults, lastDnsResults];
