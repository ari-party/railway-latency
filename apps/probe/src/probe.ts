import dns from 'node:dns/promises';

import { env } from '@/env';
import { log } from '@/pino';

import type {
  Probe,
  ProbeMeasurement,
  ProbeResults,
} from '@railway-latency/types';

const PRIVATE_INTERVAL_MS = 1_000;
const PRIVATE_TIMEOUT_MS = 60_000;
const PUBLIC_INTERVAL_MS = 1_000;
const PUBLIC_TIMEOUT_MS = 60_000;
const PROXIED_INTERVAL_MS = 1_000;
const PROXIED_TIMEOUT_MS = 60_000;

const privateTargetRegions = env.RAILWAY_REPLICA_REGIONS.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);
const publicTargetRegions = env.RAILWAY_REPLICA_REGIONS;
const proxiedTargetRegions = env.RAILWAY_REPLICA_REGIONS;

function emptyResultsFor(regions: readonly string[]): ProbeResults {
  return Object.fromEntries(
    regions.map(
      (region) =>
        [region, { http: null, dns: null } satisfies ProbeMeasurement] as const,
    ),
  );
}

let lastPrivateResults: ProbeResults = emptyResultsFor(privateTargetRegions);
let lastPublicResults: ProbeResults = emptyResultsFor(publicTargetRegions);
let lastProxiedResults: ProbeResults = emptyResultsFor(proxiedTargetRegions);
let lastPrivateMeasuredAt: number | null = null;
let lastPublicMeasuredAt: number | null = null;
let lastProxiedMeasuredAt: number | null = null;
let lastPrivateStartedAt = 0;
let lastPublicStartedAt = 0;
let lastProxiedStartedAt = 0;

// A timed-out fetch rejects with a `TimeoutError` DOMException, not always an Error.
function isTimeoutError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'TimeoutError'
  );
}

async function measureHttpToRegion(region: string) {
  const start = performance.now();

  try {
    const response = await fetch(`http://${region}.railway.internal:8080/`, {
      signal: AbortSignal.timeout(PRIVATE_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    return performance.now() - start;
  } catch (err) {
    if (isTimeoutError(err)) return PRIVATE_TIMEOUT_MS;

    log.error(err, `Failed to measure HTTP to ${region}`);
    return null;
  }
}

async function measureHttpsToRegion(region: string) {
  const start = performance.now();

  try {
    const response = await fetch(`https://${region}.up.railway.app:443/`, {
      signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    return performance.now() - start;
  } catch (err) {
    if (isTimeoutError(err)) return PUBLIC_TIMEOUT_MS;

    log.error(err, `Failed to measure HTTPS to ${region}`);
    return null;
  }
}

async function measureProxiedHttpsToRegion(region: string) {
  const start = performance.now();

  try {
    const response = await fetch(`https://${region}.railwaylatency.com/`, {
      signal: AbortSignal.timeout(PROXIED_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    return performance.now() - start;
  } catch (err) {
    if (isTimeoutError(err)) return PROXIED_TIMEOUT_MS;

    log.error(err, `Failed to measure proxied HTTPS to ${region}`);
    return null;
  }
}

async function measureDns(hostname: string, timeoutMs: number) {
  const start = performance.now();

  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<'timeout'>((resolve) => {
    timeout = setTimeout(() => resolve('timeout'), timeoutMs);
  });

  let lookupError: unknown = null;
  const lookupPromise = dns
    .lookup(hostname, { all: true })
    .then(() => 'ok' as const)
    .catch((err) => {
      lookupError = err;
      return 'error' as const;
    })
    .finally(() => {
      if (timeout) clearTimeout(timeout);
    });

  const result = await Promise.race([lookupPromise, timeoutPromise]);

  if (result === 'ok') return performance.now() - start;
  if (result === 'timeout') return timeoutMs;

  log.error(lookupError, `Failed to measure DNS to ${hostname}`);
  return null;
}

function measureDnsToRegion(region: string) {
  return measureDns(`${region}.railway.internal`, PRIVATE_TIMEOUT_MS);
}

function measurePublicDnsToRegion(region: string) {
  return measureDns(`${region}.up.railway.app`, PUBLIC_TIMEOUT_MS);
}

function measureProxiedDnsToRegion(region: string) {
  return measureDns(`${region}.railwaylatency.com`, PROXIED_TIMEOUT_MS);
}

async function runMeasurements(
  regions: readonly string[],
  measure: (region: string) => Promise<number | null>,
): Promise<Array<number | null>> {
  const settled = await Promise.allSettled(regions.map(measure));
  return settled.map((result) =>
    result.status === 'fulfilled' ? result.value : null,
  );
}

function assemble(
  regions: readonly string[],
  httpValues: Array<number | null>,
  dnsValues: Array<number | null>,
): ProbeResults {
  const results: ProbeResults = {};
  regions.forEach((region, i) => {
    results[region] = { http: httpValues[i], dns: dnsValues[i] };
  });
  return results;
}

async function measurePrivate() {
  const startedAt = Date.now();
  const [httpValues, dnsValues] = await Promise.all([
    runMeasurements(privateTargetRegions, measureHttpToRegion),
    runMeasurements(privateTargetRegions, measureDnsToRegion),
  ]);

  // Runs overlap, so a slower earlier run must not clobber a newer one.
  if (startedAt < lastPrivateStartedAt) return;
  lastPrivateStartedAt = startedAt;
  lastPrivateResults = assemble(privateTargetRegions, httpValues, dnsValues);
  lastPrivateMeasuredAt = startedAt;
}

async function measurePublic() {
  const startedAt = Date.now();
  const [httpValues, dnsValues] = await Promise.all([
    runMeasurements(publicTargetRegions, measureHttpsToRegion),
    runMeasurements(publicTargetRegions, measurePublicDnsToRegion),
  ]);

  if (startedAt < lastPublicStartedAt) return;
  lastPublicStartedAt = startedAt;
  lastPublicResults = assemble(publicTargetRegions, httpValues, dnsValues);
  lastPublicMeasuredAt = startedAt;
}

async function measureProxied() {
  const startedAt = Date.now();
  const [httpValues, dnsValues] = await Promise.all([
    runMeasurements(proxiedTargetRegions, measureProxiedHttpsToRegion),
    runMeasurements(proxiedTargetRegions, measureProxiedDnsToRegion),
  ]);

  if (startedAt < lastProxiedStartedAt) return;
  lastProxiedStartedAt = startedAt;
  lastProxiedResults = assemble(proxiedTargetRegions, httpValues, dnsValues);
  lastProxiedMeasuredAt = startedAt;
}

// Native setInterval fires every tick without waiting for the previous run to
// finish, so runs overlap and a long timeout never stretches the interval.
function run(measure: () => Promise<void>) {
  measure().catch((err) => log.error(err, 'Measurement run failed'));
}

run(measurePrivate);
run(measurePublic);
run(measureProxied);

const timers = [
  setInterval(() => run(measurePrivate), PRIVATE_INTERVAL_MS),
  setInterval(() => run(measurePublic), PUBLIC_INTERVAL_MS),
  setInterval(() => run(measureProxied), PROXIED_INTERVAL_MS),
];

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => {
    for (const timer of timers) clearInterval(timer);
  });

export const getLastResults = (): Probe => ({
  private: {
    time: lastPrivateMeasuredAt ?? Date.now(),
    results: lastPrivateResults,
  },
  public: {
    time: lastPublicMeasuredAt ?? Date.now(),
    results: lastPublicResults,
  },
  proxied: {
    time: lastProxiedMeasuredAt ?? Date.now(),
    results: lastProxiedResults,
  },
});
