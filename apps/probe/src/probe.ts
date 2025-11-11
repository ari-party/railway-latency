import { setIntervalAsync } from 'set-interval-async';

import { env, regions } from '@/config';

import type { Region } from '@/config';

const targetRegions = regions.filter(
  (region) => region !== env.RAILWAY_REPLICA_REGION,
);

const lastResults: Record<Region, number | null> = Object.fromEntries(
  targetRegions.map((region) => [region, null]),
);

async function pingRegion(region: Region) {
  const start = performance.now();

  const response = await fetch(`http://${region}/`, {
    signal: AbortSignal.timeout(30 * 1_000),
  }).catch(() => null);
  if (!response || !response.ok) return null;

  return performance.now() - start;
}

setIntervalAsync(async () => {
  const pings = await Promise.all(targetRegions.map(pingRegion));

  for (let i = 0; i < targetRegions.length; i += 1)
    lastResults[targetRegions[i]] = pings[i];

  console.log(pings);
}, 10 * 1_000);

export const getLastResults = () => lastResults;
