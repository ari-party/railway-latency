import { RANGES } from '@railway-latency/utils';
import z from 'zod';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { shaHash } from '@/server/utils/hash';
import { memoize } from '@/server/utils/memoize';

import type { QueryResultLine } from '@railway-latency/types';
import type { Range } from '@railway-latency/utils';

const replicaRegionsEnum = z.enum(
  (env.RAILWAY_REPLICA_REGIONS as [string, ...string[]]) || [],
);

function getWindow(range: Range | string): {
  aggregateWindow: string;
  rangeStart: string;
} | null {
  const now = new Date();

  switch (range) {
    case '15m':
      return {
        aggregateWindow: '5s',
        rangeStart: new Date(now.getTime() - 30 * 60 * 1000).toISOString(),
      };
    case '1h':
      return {
        aggregateWindow: '30s',
        rangeStart: new Date(now.getTime() - 1 * 60 * 60 * 1000).toISOString(),
      };
    case '1d':
      return {
        aggregateWindow: '5m',
        rangeStart: new Date(
          now.getTime() - 1 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    case '7d':
      return {
        aggregateWindow: '10m',
        rangeStart: new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    case '30d':
      return {
        aggregateWindow: '1h',
        rangeStart: new Date(
          now.getTime() - 30 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    default:
      return null;
  }
}

export const chartRouter = createTRPCRouter({
  query: publicProcedure
    .input(
      z.object({
        src: replicaRegionsEnum,
        dst: replicaRegionsEnum,
        range: z.enum(RANGES),
      }),
    )
    .query(async ({ input }) => {
      if (!aggregator) return null;
      if (input.src === input.dst) return null;

      const window = getWindow(input.range as Range);
      if (!window) return null;

      const cacheKey = `query:${shaHash(JSON.stringify(input))}`;
      return memoize(
        cacheKey,
        async () => {
          const response = await aggregator!.post('query', {
            json: {
              src: input.src,
              dst: input.dst,
              measurements: ['http', 'dns'],
              rangeEnd: new Date().toISOString(),
              ...window,
            },
          });
          if (!response.ok) return null;

          const text = (await response.text()).trim();
          return text
            .split('\n')
            .map((line) => line.split(',') as QueryResultLine);
        },
        RANGES.indexOf(input.range) === 0 ? 10 : 60,
      );
    }),
});
