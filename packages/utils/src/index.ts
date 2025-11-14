import z from 'zod';

import type {
  ProbeMeasurement,
  ProbeResults,
  ProbeResultsDictionary,
} from '@railway-latency/types';

export const ZOD_RAILWAY_REPLICA_REGIONS = z
  .string()
  .default('')
  .transform((v) => v.trim().split(','));

export function getRangeOptionsSchema(replicaRegions: readonly string[]) {
  const replicaRegionsEnum = z.enum(replicaRegions);

  return z
    .object({
      src: replicaRegionsEnum,
      dst: replicaRegionsEnum,
      rangeStart: z.iso.datetime(),
      rangeEnd: z.iso.datetime(),
      measurements: z
        .array(z.union([z.literal('http'), z.literal('dns')]))
        .min(1),
      aggregateWindow: z.string(),
    })
    .strict();
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
