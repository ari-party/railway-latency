import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';

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

function measureHttpRequest(
  url: string,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const transport = url.startsWith('https:') ? https : http;

    let settled = false;
    const done = (value: number | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const req = transport.request(
      url,
      { agent: false, method: 'GET' },
      (res) => {
        const ok = res.statusCode !== undefined && res.statusCode < 400;
        res.resume();
        res.on('end', () => done(ok ? performance.now() - start : null));
        res.on('error', () => done(null));
      },
    );

    // Bounds the whole request including DNS, which the socket timeout misses.
    const timer = setTimeout(() => {
      done(timeoutMs);
      req.destroy();
    }, timeoutMs);

    req.on('close', () => clearTimeout(timer));
    req.on('error', () => done(null));
    req.end();
  });
}

function measureHttpToRegion(region: string) {
  return measureHttpRequest(
    `http://${region}.railway.internal:8080/`,
    PRIVATE_TIMEOUT_MS,
  );
}

function measureHttpsToRegion(region: string) {
  return measureHttpRequest(
    `https://${region}.up.railway.app:443/`,
    PUBLIC_TIMEOUT_MS,
  );
}

function measureProxiedHttpsToRegion(region: string) {
  return measureHttpRequest(
    `https://${region}.railwaylatency.com/`,
    PROXIED_TIMEOUT_MS,
  );
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
