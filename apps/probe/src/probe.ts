import dns from 'node:dns/promises';

import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { log } from '@/pino';

import type { ProbeMeasurement, ProbeResults } from '@railway-latency/types';

const targetRegions = env.RAILWAY_REPLICA_REGIONS.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);

const lastResults: ProbeResults = Object.fromEntries(
  targetRegions.map(
    (region) =>
      [
        region,
        {
          http: null,
          dns: null,
        },
      ] as const,
  ),
);
let lastResultsMeasuredAt: number | null = null;

function ensureMeasurementFor(region: string) {
  if (!lastResults[region])
    lastResults[region] = {
      http: null,
      dns: null,
    } satisfies ProbeMeasurement;
}

async function measureHttpToRegion(region: string) {
  const start = performance.now();

  const response = await fetch(`http://${region}.railway.internal:8080/`, {
    signal: AbortSignal.timeout(1_000),
  }).catch((err) => {
    log.error(err, `Failed to measure HTTP to ${region}`);
    return null;
  });
  if (!response || !response.ok) return null;

  return performance.now() - start;
}

async function measureAllHttp() {
  const httpMeasurements = await Promise.allSettled(
    targetRegions.map(measureHttpToRegion),
  );

  for (let i = 0; i < targetRegions.length; i += 1) {
    const latency = httpMeasurements[i];
    const region = targetRegions[i];

    ensureMeasurementFor(region);

    if (latency.status === 'fulfilled')
      lastResults[region].http = latency.value;
    else lastResults[region].http = null;
  }
}

async function measureDnsToRegion(region: string) {
  const start = performance.now();

  const lookupPromise = dns
    .lookup(`${region}.railway.internal`, { all: true })
    .then(() => true)
    .catch((err) => {
      log.error(err, `Failed to measure DNS to ${region}`);
      return false;
    });

  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<boolean>((resolve) => {
    timeout = setTimeout(() => {
      log.error(`Timed out measuring DNS to ${region}`);
      resolve(false);
    }, 1_000);
  });

  const success = await Promise.race([
    lookupPromise.finally(() => {
      if (timeout) clearTimeout(timeout);
    }),
    timeoutPromise,
  ]);
  if (!success) return null;

  return performance.now() - start;
}

async function measureAllDns() {
  const dnsMeasurements = await Promise.allSettled(
    targetRegions.map(measureDnsToRegion),
  );

  for (let i = 0; i < targetRegions.length; i += 1) {
    const latency = dnsMeasurements[i];
    const region = targetRegions[i];
    ensureMeasurementFor(region);

    if (latency.status === 'fulfilled') lastResults[region].dns = latency.value;
    else lastResults[region].dns = null;
  }
}

async function measureAll() {
  await Promise.all([measureAllHttp(), measureAllDns()]);
  lastResultsMeasuredAt = Date.now();
}

measureAll().finally(() => {
  const interval = setIntervalAsync(measureAll, 1_000);

  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals)
    process.on(signal, () => clearIntervalAsync(interval));
});

export const getLastResults = (): [ProbeResults, number | null] => [
  lastResults,
  lastResultsMeasuredAt,
];
