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

interface HttpTiming {
  // Request/response over the established connection (TTFB + transfer). This is
  // what the plain HTTP series measured before fresh-connection-per-sample.
  request: number;
  // TCP + TLS handshake, measured from DNS resolution to a ready connection.
  // DNS is excluded because it's tracked by its own measurement. Null when the
  // connection never came up.
  handshake: number | null;
}

function measureHttpRequest(
  url: string,
  timeoutMs: number,
): Promise<HttpTiming | null> {
  return new Promise((resolve) => {
    const start = performance.now();
    const transport = url.startsWith('https:') ? https : http;

    // Socket lifecycle marks. `connectReady` lands on `secureConnect` for TLS,
    // falling back to `connect` for plain HTTP.
    let dnsDone: number | undefined;
    let connectReady: number | undefined;

    let settled = false;
    const done = (value: HttpTiming | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const handshakeMs = () =>
      connectReady === undefined ? null : connectReady - (dnsDone ?? start);

    const req = transport.request(
      url,
      { agent: false, method: 'GET' },
      (res) => {
        const ok = res.statusCode !== undefined && res.statusCode < 400;
        res.resume();
        res.on('end', () => {
          if (!ok) return done(null);
          const end = performance.now();
          done({
            request:
              connectReady === undefined ? end - start : end - connectReady,
            handshake: handshakeMs(),
          });
        });
        res.on('error', () => done(null));
      },
    );

    req.on('socket', (socket) => {
      socket.on('lookup', () => {
        dnsDone = performance.now();
      });
      socket.on('connect', () => {
        connectReady = performance.now();
      });
      socket.on('secureConnect', () => {
        connectReady = performance.now();
      });
    });

    // Bounds the whole request including DNS, which the socket timeout misses.
    // Report the ceiling for the request; keep a real handshake if we got one,
    // otherwise the handshake itself stalled, so it gets the ceiling too.
    const timer = setTimeout(() => {
      done({ request: timeoutMs, handshake: handshakeMs() ?? timeoutMs });
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

interface Sample {
  measurement: Measurement;
  ms: number;
}

interface Check {
  // A single probe can yield several measurements (e.g. an HTTP request
  // produces both a request and a handshake sample).
  measure: (region: string) => Promise<Sample[]>;
}

// Wraps an HTTP timing measurement into request + handshake samples.
function httpCheck(
  measure: (region: string) => Promise<HttpTiming | null>,
  httpMeasurement: Measurement,
  handshakeMeasurement: Measurement,
): Check {
  return {
    measure: async (region) => {
      const timing = await measure(region);
      if (!timing) return [];

      const samples: Sample[] = [
        { measurement: httpMeasurement, ms: timing.request },
      ];
      if (timing.handshake !== null)
        samples.push({
          measurement: handshakeMeasurement,
          ms: timing.handshake,
        });
      return samples;
    },
  };
}

// Wraps a DNS measurement into a single sample.
function dnsCheck(
  measure: (region: string) => Promise<number | null>,
  measurement: Measurement,
): Check {
  return {
    measure: async (region) => {
      const ms = await measure(region);
      return typeof ms === 'number' ? [{ measurement, ms }] : [];
    },
  };
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
      httpCheck(measureHttpToRegion, 'http', 'handshake'),
      dnsCheck(measureDnsToRegion, 'dns'),
    ],
  },
  {
    regions: publicTargetRegions,
    intervalMs: PUBLIC_INTERVAL_MS,
    checks: [
      httpCheck(measureHttpsToRegion, 'httpPublic', 'handshakePublic'),
      dnsCheck(measurePublicDnsToRegion, 'dnsPublic'),
    ],
  },
  {
    regions: proxiedTargetRegions,
    intervalMs: PROXIED_INTERVAL_MS,
    checks: [
      httpCheck(measureProxiedHttpsToRegion, 'httpProxied', 'handshakeProxied'),
      dnsCheck(measureProxiedDnsToRegion, 'dnsProxied'),
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
      const samples = await check.measure(dst);
      for (const { measurement, ms } of samples)
        enqueue({ measurement, dst, time: startedAt, ms });
    } catch (err) {
      log.error(err, `Loop failed for ${dst}`);
    }

    if (stopped) return;
    const delay = Math.max(0, intervalMs - (Date.now() - startedAt));
    timer = setTimeout(loop, delay);
  }

  loop().catch((err) => log.error(err, `Loop crashed for ${dst}`));
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
