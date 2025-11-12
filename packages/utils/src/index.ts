import type {
  ProbeResults,
  ProbeResultsDictionary,
} from '@railway-latency/types';

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
