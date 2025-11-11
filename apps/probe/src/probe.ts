import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';

const targetRegions = env.RAILWAY_REPLICA_REGIONS.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);

const lastResults: Record<string, number | null> = Object.fromEntries(
  targetRegions.map((region) => [region, null]),
);

async function pingRegion(region: string) {
  const start = performance.now();

  const response = await fetch(`http://${region}.railway.internal:8080/`, {
    signal: AbortSignal.timeout(30 * 1_000),
  }).catch(() => null);
  if (!response || !response.ok) return null;

  return performance.now() - start;
}

setIntervalAsync(async () => {
  const pings = await Promise.allSettled(targetRegions.map(pingRegion));

  for (let i = 0; i < targetRegions.length; i += 1) {
    const ping = pings[i];
    if (ping.status === 'fulfilled') lastResults[targetRegions[i]] = ping.value;
    else lastResults[targetRegions[i]] = null;
  }
}, 1_000);

export const getLastResults = () => lastResults;
