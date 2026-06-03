import z from 'zod';

import type {
  NetworkResultsDictionary,
  ProbeMeasurement,
  ProbeResults,
  ProbeResultsDictionary,
} from '@railway-latency/types';

export const ZOD_RAILWAY_REPLICA_REGIONS = z
  .string()
  .default('')
  .transform((v) => v.trim().split(','));

export const RANGES = ['15m', '1h', '1d', '7d', '30d'] as const;
export type Range = (typeof RANGES)[number];

export interface RegionCoord {
  lat: number;
  lng: number;
}

export const REGION_COORDS: Record<string, RegionCoord> = {
  'us-west2': { lat: 37.378463, lng: -121.954945 },
  'us-east4-eqdc4a': { lat: 39.016363, lng: -77.459023 },
  'europe-west4-drams3a': { lat: 52.28415, lng: 4.770855 },
  'asia-southeast1-eqsg3a': { lat: 1.29556, lng: 103.790346 },
};

export function getRegionCoord(region: string): RegionCoord | null {
  if (REGION_COORDS[region]) return REGION_COORDS[region];

  const prefixMatch = Object.keys(REGION_COORDS).find(
    (key) => region.startsWith(key) || key.startsWith(region),
  );
  return prefixMatch ? REGION_COORDS[prefixMatch] : null;
}

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
          z.literal('httpPublic'),
          z.literal('dnsPublic'),
          z.literal('httpProxied'),
          z.literal('dnsProxied'),
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
