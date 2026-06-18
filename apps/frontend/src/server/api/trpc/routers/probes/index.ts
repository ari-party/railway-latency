import { z } from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { controlPlane } from '@/server/services/controlPlane';
import { memoize } from '@/server/utils/memoize';

import type { ProbeMetadata } from '@railway-latency/types';

const MAP_ROSTER_TTL_SECONDS = 30;
const RECENT_POPS_WINDOW_MS = 30 * 1_000;

const probeMetadataSchema = z.object({
  probeId: z.string(),
  lat: z.number().finite(),
  lon: z.number().finite(),
  status: z.enum(['green', 'stale', 'down', 'inactive']),
});

const recentPopsInput = z.object({
  src: z.string().max(64),
  network: z.enum(['public', 'proxied']),
});

const probePopRouteSchema = z.object({
  dst: z.string(),
  hikariPop: z.string(),
  hits: z.number(),
  latencyMs: z.number().nullable().default(null),
});

const aggregatorProbePopsSchema = z.object({
  routes: z.array(probePopRouteSchema),
});

export type ProbePopRoute = z.infer<typeof probePopRouteSchema>;

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

  recentPops: publicProcedure
    .input(recentPopsInput)
    .query(async ({ input }): Promise<ProbePopRoute[]> => {
      if (!aggregator) return [];

      try {
        const response = await aggregator.post('query/probe-pops', {
          json: {
            src: input.src,
            network: input.network,
            sinceMs: Date.now() - RECENT_POPS_WINDOW_MS,
          },
        });
        if (!response.ok) return [];

        const parsed = aggregatorProbePopsSchema.safeParse(
          await response.json(),
        );
        if (!parsed.success) {
          console.error(
            'probes.recentPops: malformed aggregator response',
            parsed.error,
          );
          return [];
        }

        return parsed.data.routes;
      } catch {
        return [];
      }
    }),
});
