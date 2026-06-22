import { RANGES } from '@railway-latency/utils';
import z from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { shaHash } from '@/server/utils/hash';
import { memoize } from '@/server/utils/memoize';
import { getQueryWindow } from '@/server/utils/queryWindow';

import type { FrontendRange } from '@/utils/query';

export interface FleetMetricsPoint {
  bucketMs: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  total: number;
  errors: number;
  failDns: number;
  failHandshake: number;
  failHttp: number;
}

const QUERY_RANGES = [...RANGES, 'live'] as const;

const metricsInput = z.object({
  range: z.enum(QUERY_RANGES),
  network: z.enum(['private', 'public', 'proxied']).default('private'),
});

const fleetMetricsPointSchema = z.object({
  bucketMs: z.number(),
  p50: z.number().nullable(),
  p95: z.number().nullable(),
  p99: z.number().nullable(),
  total: z.number(),
  errors: z.number(),
  failDns: z.number(),
  failHandshake: z.number(),
  failHttp: z.number(),
});

function getCacheExpiry(range: FrontendRange): number {
  if (range === 'live') return 1;

  return RANGES.indexOf(range) === 0 ? 10 : 60;
}

export const metricsRouter = createTRPCRouter({
  fleet: publicProcedure.input(metricsInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const cacheKey = `metrics:${shaHash(JSON.stringify(input))}`;
    return memoize(
      cacheKey,
      async () => {
        const response = await aggregator!.post('query/metrics', {
          json: { network: input.network, ...getQueryWindow(input.range) },
        });
        if (!response.ok) return null;

        const parsed = z
          .array(fleetMetricsPointSchema)
          .safeParse(await response.json());
        if (!parsed.success) {
          console.error(
            'metrics.fleet: malformed aggregator response',
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
