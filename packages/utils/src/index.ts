import type { ProbeResults } from '@railway-latency/types';

export function getEmptyResults(
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
