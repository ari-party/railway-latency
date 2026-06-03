import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { log } from '@/pino';

import type { MtrHop, MtrProbe, MtrRoute } from '@railway-latency/types';

const execFileAsync = promisify(execFile);

const MTR_INTERVAL_MS = 5 * 60 * 1_000;
const MTR_CYCLES = 3;
const MTR_TIMEOUT_MS = 30_000;
const DIG_TIMEOUT_MS = 5_000;

const mtrTargetRegions = env.RAILWAY_REPLICA_REGIONS.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);

const lastRoutes: Record<string, MtrRoute> = Object.fromEntries(
  mtrTargetRegions.map((region) => [region, { hops: [] }] as const),
);
let lastMtrMeasuredAt: number | null = null;

const rdnsCache = new Map<string, string | null>();

async function reverseDns(ip: string): Promise<string | null> {
  const cached = rdnsCache.get(ip);
  if (cached !== undefined) return cached;

  try {
    const { stdout } = await execFileAsync(
      'dig',
      ['+short', '+time=2', '+tries=1', '-x', ip],
      { timeout: DIG_TIMEOUT_MS },
    );
    const line = stdout
      .split('\n')
      .map((value) => value.trim())
      .find(Boolean);
    const hostname = line ? line.replace(/\.$/, '') : null;

    rdnsCache.set(ip, hostname);
    return hostname;
  } catch (err) {
    log.error(err, `Failed reverse DNS for ${ip}`);
    return null;
  }
}

interface MtrHub {
  count?: number;
  host?: string;
  Avg?: number;
  'Loss%'?: number;
}

async function mtrToRegion(region: string): Promise<MtrHop[]> {
  const host = `${region}.up.railway.app`;

  let stdout: string;
  try {
    ({ stdout } = await execFileAsync(
      'mtr',
      ['-n', '--json', '-c', String(MTR_CYCLES), host],
      { timeout: MTR_TIMEOUT_MS, maxBuffer: 1024 * 1024 },
    ));
  } catch (err) {
    log.error(err, `Failed to mtr to ${region}`);
    return [];
  }

  let hubs: MtrHub[];
  try {
    hubs = JSON.parse(stdout)?.report?.hubs;
  } catch (err) {
    log.error(err, `Failed to parse mtr output for ${region}`);
    return [];
  }
  if (!Array.isArray(hubs)) return [];

  const hops: MtrHop[] = [];
  for (let i = 0; i < hubs.length; i += 1) {
    const hub = hubs[i];
    const ip = hub.host && hub.host !== '???' ? hub.host : null;

    hops.push({
      hop: typeof hub.count === 'number' ? hub.count : i + 1,
      ip,
      hostname: ip ? await reverseDns(ip) : null,
      avgMs: typeof hub.Avg === 'number' ? hub.Avg : null,
      lossPct: typeof hub['Loss%'] === 'number' ? hub['Loss%'] : 0,
    });
  }

  return hops;
}

async function measureMtr() {
  await Promise.all(
    mtrTargetRegions.map(async (region) => {
      lastRoutes[region] = { hops: await mtrToRegion(region) };
    }),
  );
  lastMtrMeasuredAt = Date.now();
}

measureMtr().finally(() => {
  const interval = setIntervalAsync(measureMtr, MTR_INTERVAL_MS);

  const signals = ['SIGINT', 'SIGTERM'];
  for (const signal of signals)
    process.on(signal, () => clearIntervalAsync(interval));
});

export const getLastMtr = (): MtrProbe => ({
  time: lastMtrMeasuredAt ?? Date.now(),
  routes: lastRoutes,
});
