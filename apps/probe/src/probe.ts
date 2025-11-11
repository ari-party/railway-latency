import dns from 'node:dns/promises';

import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';

const targetRegions = env.RAILWAY_REPLICA_REGIONS.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);

type Results = Record<string, number | null>;

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

async function measureHttp() {
  const httpMeasurements = await Promise.allSettled(
    targetRegions.map(measureHttpToRegion),
  );

  for (let i = 0; i < targetRegions.length; i += 1) {
    const ping = httpMeasurements[i];
    if (ping.status === 'fulfilled')
      lastHttpResults[targetRegions[i]] = ping.value;
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

async function measureDns() {
  const dnsMeasurements = await Promise.allSettled(
    targetRegions.map(measureDnsToRegion),
  );

  for (let i = 0; i < targetRegions.length; i += 1) {
    const ping = dnsMeasurements[i];
    if (ping.status === 'fulfilled')
      lastDnsResults[targetRegions[i]] = ping.value;
    else lastDnsResults[targetRegions[i]] = null;
  }
}

setIntervalAsync(async () => {
  await Promise.all([measureHttp(), measureDns()]);
}, 1_000);

export const getLastResults = () => [lastHttpResults, lastDnsResults];
