import { RANGES } from '@railway-latency/utils';
import z from 'zod';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { shaHash } from '@/server/utils/hash';
import { memoize } from '@/server/utils/memoize';

import type {
  Measurement,
  Network,
  QueryResultLine,
} from '@railway-latency/types';
import type { Range } from '@railway-latency/utils';

const replicaRegionsEnum = z.enum(
  (env.RAILWAY_REPLICA_REGIONS as [string, ...string[]]) || [],
);

const NETWORK_MEASUREMENTS: Record<Network, Measurement[]> = {
  private: ['http', 'dns', 'handshake'],
  public: ['httpPublic', 'httpPublicHikari', 'dnsPublic', 'handshakePublic'],
  proxied: [
    'httpProxied',
    'httpProxiedHikari',
    'dnsProxied',
    'handshakeProxied',
  ],
};

const QUERY_RANGES = [...RANGES, 'live'] as const;

function getWindow(range: Range | string): {
  aggregateWindow: string;
  rangeStart: string;
} | null {
  const now = new Date();

  switch (range) {
    case 'live':
      return {
        aggregateWindow: '500ms',
        rangeStart: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      };
    case '15m':
      return {
        aggregateWindow: '5s',
        rangeStart: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      };
    case '3h':
      return {
        aggregateWindow: '10s',
        rangeStart: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      };
    case '1d':
      return {
        aggregateWindow: '1m',
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

function parseLine(line: string) {
  return line.split(',') as QueryResultLine;
}

function getCacheExpiry(range: Range | 'live'): number {
  if (range === 'live') return 1;

  return RANGES.indexOf(range) === 0 ? 10 : 60;
}

export const chartRouter = createTRPCRouter({
  query: publicProcedure
    .input(
      z.object({
        src: replicaRegionsEnum,
        dst: replicaRegionsEnum,
        range: z.enum(QUERY_RANGES),
        network: z.enum(['private', 'public', 'proxied']).default('private'),
      }),
    )
    .query(async ({ input }) => {
      if (!aggregator) return null;

      const window = getWindow(input.range);
      if (!window) return null;

      const cacheKey = `query:${shaHash(JSON.stringify(input))}`;
      return memoize(
        cacheKey,
        async () => {
          const response = await aggregator!.post('query', {
            json: {
              src: input.src,
              dst: input.dst,
              measurements: NETWORK_MEASUREMENTS[input.network],
              rangeEnd: new Date().toISOString(),
              ...window,
            },
          });
          if (!response.ok) return null;

          const text = (await response.text()).trim();
          return text.split('\n').map(parseLine);
        },
        getCacheExpiry(input.range),
      );
    }),
});
