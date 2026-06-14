import z from 'zod';

import type {
  LifecycleStatus,
  NetworkResultsDictionary,
  ProbeMeasurement,
  ProbeResults,
  ProbeResultsDictionary,
  ProbeStatus,
} from '@railway-latency/types';

export const STALE_AFTER_MS = 60 * 1_000;
export const DOWN_AFTER_MS = 5 * 60 * 1_000;

export type DisplayStatus =
  | 'green'
  | 'stale'
  | 'down'
  | 'pending'
  | 'revoked'
  | 'disabled';

export function deriveDisplayStatus(
  lifecycleStatus: LifecycleStatus,
  lastSeen: string | null,
  now: number = Date.now(),
): DisplayStatus {
  if (lifecycleStatus === 'revoked') return 'revoked';
  if (lifecycleStatus === 'disabled') return 'disabled';
  if (lifecycleStatus === 'created' || lifecycleStatus === 'enrolled')
    return 'pending';

  if (!lastSeen) return 'down';
  const age = now - new Date(lastSeen).getTime();
  if (age < STALE_AFTER_MS) return 'green';
  if (age < DOWN_AFTER_MS) return 'stale';
  return 'down';
}

export function toMapStatus(display: DisplayStatus): ProbeStatus {
  if (display === 'pending' || display === 'revoked' || display === 'disabled')
    return 'inactive';
  return display;
}

export const ZOD_RAILWAY_REPLICA_REGIONS = z
  .string()
  .default('')
  .transform((v) => v.trim().split(','));

export const RANGES = ['15m', '3h', '1d', '7d', '30d'] as const;
export type Range = (typeof RANGES)[number];

export function getRangeOptionsSchema(replicaRegions: readonly string[]) {
  const replicaRegionsEnum = z.enum(replicaRegions);

  return z.object({
    src: replicaRegionsEnum,
    dst: replicaRegionsEnum,
    rangeStart: z.iso.datetime(),
    rangeEnd: z.iso.datetime(),
    measurements: z
      .array(
        z.union([
          z.literal('http'),
          z.literal('dns'),
          z.literal('handshake'),
          z.literal('httpPublic'),
          z.literal('httpPublicHikari'),
          z.literal('dnsPublic'),
          z.literal('handshakePublic'),
          z.literal('httpProxied'),
          z.literal('httpProxiedHikari'),
          z.literal('dnsProxied'),
          z.literal('handshakeProxied'),
        ]),
      )
      .min(1),
    aggregateWindow: z.string(),
  });
}

export function getEmptyProbeResults(
  replicaRegions: readonly string[],
): ProbeResults {
  return Object.fromEntries(
    replicaRegions.map(
      (subRegion) =>
        [
          subRegion,
          {
            http: null,
            dns: null,
            handshake: null,
          } satisfies ProbeMeasurement,
        ] as const,
    ),
  );
}

export function getEmptyProbeResultsDictionary(
  regions: readonly string[],
): ProbeResultsDictionary {
  return Object.fromEntries(
    regions.map((region) => [region, getEmptyProbeResults(regions)]),
  );
}

export function getEmptyNetworkResultsDictionary(
  regions: readonly string[],
): NetworkResultsDictionary {
  return {
    private: getEmptyProbeResultsDictionary(regions),
    public: getEmptyProbeResultsDictionary(regions),
    proxied: getEmptyProbeResultsDictionary(regions),
  };
}

export interface RegionCoord {
  lat: number;
  lon: number;
}

export const REGION_COORDS: Record<string, RegionCoord> = {
  'us-west2': { lat: 37.378463, lon: -121.954945 },
  'us-east4-eqdc4a': { lat: 39.016363, lon: -77.459023 },
  'europe-west4-drams3a': { lat: 52.28415, lon: 4.770855 },
  'asia-southeast1-eqsg3a': { lat: 1.29556, lon: 103.790346 },
};
