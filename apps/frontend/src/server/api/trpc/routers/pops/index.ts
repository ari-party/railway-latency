import { RANGES } from '@railway-latency/utils';
import z from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { shaHash } from '@/server/utils/hash';
import { memoize } from '@/server/utils/memoize';
import { getQueryWindow } from '@/server/utils/queryWindow';

import type { FrontendRange } from '@/utils/query';

const QUERY_RANGES = [...RANGES, 'live'] as const;

const POPS_LOOKBACK_MS = 24 * 60 * 60 * 1_000;
const POPS_TTL_SECONDS = 60;

export interface PopProbeLatencyPoint {
  probe: string;
  bucketMs: number;
  p50: number | null;
}

const railwayPopSchema = z.object({
  pop: z.string(),
  hits: z.number(),
});

const popLatencyPointSchema = z.object({
  probe: z.string(),
  bucketMs: z.number(),
  p50: z.number().nullable(),
});

const latencyInput = z.object({
  pop: z.string().max(32),
  dst: z.string().max(64).nullable().default(null),
  range: z.enum(QUERY_RANGES),
});

function getCacheExpiry(range: FrontendRange): number {
  if (range === 'live') return 1;

  return RANGES.indexOf(range) === 0 ? 10 : 60;
}

export const popsRouter = createTRPCRouter({
  // Throw rather than return null so memoize doesn't cache the failure for the TTL.
  list: publicProcedure.query(async (): Promise<string[] | null> => {
    if (!aggregator) return null;

    try {
      return await memoize(
        'pops:list',
        async () => {
          const response = await aggregator!.post('query/pops', {
            json: { sinceMs: Date.now() - POPS_LOOKBACK_MS },
          });
          if (!response.ok) {
            throw new Error(`pops query failed (${response.status})`);
          }

          const parsed = z
            .array(railwayPopSchema)
            .safeParse(await response.json());
          if (!parsed.success) {
            console.error('pops.list: malformed aggregator response', parsed.error);
            throw new Error('malformed pops response');
          }

          return parsed.data.map((entry) => entry.pop);
        },
        POPS_TTL_SECONDS,
      );
    } catch {
      return null;
    }
  }),

  latency: publicProcedure
    .input(latencyInput)
    .query(async ({ input }): Promise<PopProbeLatencyPoint[] | null> => {
      if (!aggregator) return null;

      const cacheKey = `pops:latency:${shaHash(JSON.stringify(input))}`;
      return memoize(
        cacheKey,
        async () => {
          const response = await aggregator!.post('query/pop-latency', {
            json: {
              pop: input.pop,
              dst: input.dst,
              ...getQueryWindow(input.range),
            },
          });
          if (!response.ok) return null;

          const parsed = z
            .array(popLatencyPointSchema)
            .safeParse(await response.json());
          if (!parsed.success) {
            console.error(
              'pops.latency: malformed aggregator response',
              parsed.error,
            );
            return null;
          }

          return parsed.data;
        },
        getCacheExpiry(input.range),
      );
    }),
});
