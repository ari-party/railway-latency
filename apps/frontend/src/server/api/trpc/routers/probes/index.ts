import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { controlPlane } from '@/server/services/controlPlane';
import { memoize } from '@/server/utils/memoize';

import type { ProbeMetadata } from '@railway-latency/types';

const MAP_ROSTER_TTL_SECONDS = 30;

const probeMetadataSchema = z.object({
  probeId: z.string(),
  lat: z.number().finite(),
  lon: z.number().finite(),
  status: z.enum(['green', 'stale', 'down', 'inactive']),
});

export const probesRouter = createTRPCRouter({
  list: publicProcedure.query(async (): Promise<ProbeMetadata[]> => {
    if (!controlPlane) return [];

    const client = controlPlane;

    try {
      // Throw rather than return []: memoize caches only resolved values, so a
      // transient failure must not pin the empty fallback for the whole TTL.
      return await memoize(
        'probes:map-roster',
        async () => {
          const response = await client.get('internal/map-roster');
          if (!response.ok) {
            throw new Error(`map-roster request failed (${response.status})`);
          }

          const roster = await response.json<unknown>();
          if (!Array.isArray(roster)) return [];

          return roster.flatMap((entry) => {
            const parsed = probeMetadataSchema.safeParse(entry);
            return parsed.success ? [parsed.data] : [];
          });
        },
        MAP_ROSTER_TTL_SECONDS,
      );
    } catch {
      return [];
    }
  }),
});
