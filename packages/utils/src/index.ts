import z from 'zod';

import type {
  ProbeResults,
  ProbeResultsDictionary,
} from '@railway-latency/types';

export const ZOD_RAILWAY_REPLICA_REGIONS = z
  .string()
  .default('')
  .transform((v) => v.trim().split(','));

export function getEmptyProbeResults(
  region: string,
  replicaRegions: readonly string[],
): ProbeResults {
  const empty = Object.fromEntries(
    replicaRegions
      .filter((subRegion) => subRegion !== region)
      .map((subRegion) => [subRegion, null] as const),
  );

  return {
    http: empty,
    dns: empty,
  } satisfies ProbeResults;
}

export function getEmptyProbeResultsDictionary(
  regions: readonly string[],
): ProbeResultsDictionary {
  return Object.fromEntries(
    regions.map((region) => [region, getEmptyProbeResults(region, regions)]),
  );
}
