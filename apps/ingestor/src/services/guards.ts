import { env } from '@/env';
import { log } from '@/pino';

const trustedRegionSlugs = new Set(env.RAILWAY_REPLICA_REGIONS);

if (trustedRegionSlugs.size === 0)
  log.warn(
    { name: 'guards' },
    'RAILWAY_REPLICA_REGIONS is empty; every destination is rejected until it is set',
  );

const BASELINE_DST = 'baseline';

export function isTrustedDestination(destination: string): boolean {
  return destination === BASELINE_DST || trustedRegionSlugs.has(destination);
}

export function withinTimeWindow(time: number, now: number): boolean {
  if (time > now + env.MAX_FUTURE_SKEW_MS) return false;
  if (time < now - env.BUFFER_RETENTION_MS) return false;
  return true;
}
