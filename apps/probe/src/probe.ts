import dns from 'node:dns/promises';

import { env } from '@/env';
import { log } from '@/pino';

import type { Measurement, ProbeSample } from '@railway-latency/types';

const PRIVATE_INTERVAL_MS = 1_000;
const PRIVATE_TIMEOUT_MS = 60_000;
const PUBLIC_INTERVAL_MS = 1_000;
const PUBLIC_TIMEOUT_MS = 60_000;
const PROXIED_INTERVAL_MS = 1_000;
const PROXIED_TIMEOUT_MS = 60_000;
const MAX_QUEUE = 5_000;

const privateTargetRegions = env.RAILWAY_REPLICA_REGIONS.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);
const publicTargetRegions = env.RAILWAY_REPLICA_REGIONS;
const proxiedTargetRegions = env.RAILWAY_REPLICA_REGIONS;

// A timed-out fetch rejects with a `TimeoutError` DOMException, not always an Error.
function isTimeoutError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'TimeoutError'
  );
}

async function measureHttpToRegion(region: string): Promise<number | null> {
  const start = performance.now();

  try {
    const response = await fetch(`http://${region}.railway.internal:8080/`, {
      signal: AbortSignal.timeout(PRIVATE_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    return performance.now() - start;
  } catch (err) {
    if (!isTimeoutError(err))
      log.error(err, `Failed to measure HTTP to ${region}`);
    return null;
  }
}

async function measureHttpsToRegion(region: string): Promise<number | null> {
  const start = performance.now();

  try {
    const response = await fetch(`https://${region}.up.railway.app:443/`, {
      signal: AbortSignal.timeout(PUBLIC_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    return performance.now() - start;
  } catch (err) {
    if (!isTimeoutError(err))
      log.error(err, `Failed to measure HTTPS to ${region}`);
    return null;
  }
}

async function measureProxiedHttpsToRegion(
  region: string,
): Promise<number | null> {
  const start = performance.now();

  try {
    const response = await fetch(`https://${region}.railwaylatency.com/`, {
      signal: AbortSignal.timeout(PROXIED_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    return performance.now() - start;
  } catch (err) {
    if (!isTimeoutError(err))
      log.error(err, `Failed to measure proxied HTTPS to ${region}`);
    return null;
  }
}

async function measureDns(
  hostname: string,
  timeoutMs: number,
): Promise<number | null> {
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
  if (result === 'error')
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

const queue: ProbeSample[] = [];

function enqueue(sample: ProbeSample) {
  queue.push(sample);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
}

export function drainSamples(): ProbeSample[] {
  return queue.splice(0, queue.length);
}

interface Check {
  measurement: Measurement;
  measure: (region: string) => Promise<number | null>;
}

interface NetworkSpec {
  regions: readonly string[];
  intervalMs: number;
  checks: Check[];
}

const networks: NetworkSpec[] = [
  {
    regions: privateTargetRegions,
    intervalMs: PRIVATE_INTERVAL_MS,
    checks: [
      { measurement: 'http', measure: measureHttpToRegion },
      { measurement: 'dns', measure: measureDnsToRegion },
    ],
  },
  {
    regions: publicTargetRegions,
    intervalMs: PUBLIC_INTERVAL_MS,
    checks: [
      { measurement: 'httpPublic', measure: measureHttpsToRegion },
      { measurement: 'dnsPublic', measure: measurePublicDnsToRegion },
    ],
  },
  {
    regions: proxiedTargetRegions,
    intervalMs: PROXIED_INTERVAL_MS,
    checks: [
      { measurement: 'httpProxied', measure: measureProxiedHttpsToRegion },
      { measurement: 'dnsProxied', measure: measureProxiedDnsToRegion },
    ],
  },
];

const stops: Array<() => void> = [];

function startLoop(dst: string, check: Check, intervalMs: number) {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  async function loop() {
    if (stopped) return;

    const startedAt = Date.now();
    try {
      const ms = await check.measure(dst);
      if (typeof ms === 'number')
        enqueue({ measurement: check.measurement, dst, time: startedAt, ms });
    } catch (err) {
      log.error(err, `Loop failed for ${check.measurement} ${dst}`);
    }

    if (stopped) return;
    const delay = Math.max(0, intervalMs - (Date.now() - startedAt));
    timer = setTimeout(loop, delay);
  }

  loop().catch((err) =>
    log.error(err, `Loop crashed for ${check.measurement} ${dst}`),
  );
  stops.push(() => {
    stopped = true;
    if (timer) clearTimeout(timer);
  });
}

for (const network of networks)
  for (const dst of network.regions)
    for (const check of network.checks)
      startLoop(dst, check, network.intervalMs);

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => {
    for (const stop of stops) stop();
  });
