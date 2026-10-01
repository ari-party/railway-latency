import { RANGES } from '@railway-latency/utils';
import z from 'zod';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { shaHash } from '@/server/utils/hash';
import { memoize } from '@/server/utils/memoize';
import { getQueryWindow } from '@/server/utils/queryWindow';

import type {
  Measurement,
  Network,
  QueryErrorLine,
  QueryResultLine,
} from '@railway-latency/types';
import type { Range } from '@railway-latency/utils';

const replicaRegionsEnum = z.enum(
  (env.RAILWAY_REPLICA_REGIONS as [string, ...string[]]) || [],
);

const nodeSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

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

function parseLine(line: string) {
  return line.split(',') as QueryResultLine;
}

function parseErrorLine(line: string): QueryErrorLine {
  const comma = line.indexOf(',');
  return [line.slice(0, comma), line.slice(comma + 1)];
}

function getCacheExpiry(range: Range | 'live'): number {
  if (range === 'live') return 1;

  return RANGES.indexOf(range) === 0 ? 10 : 60;
}

const chartInput = z.object({
  src: nodeSchema,
  dst: replicaRegionsEnum,
  range: z.enum(QUERY_RANGES),
  network: z.enum(['private', 'public', 'proxied']).default('private'),
});

const baselineInput = z.object({
  src: nodeSchema,
  range: z.enum(QUERY_RANGES),
});

export const chartRouter = createTRPCRouter({
  query: publicProcedure.input(chartInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const cacheKey = `query:${shaHash(JSON.stringify(input))}`;
    return memoize(
      cacheKey,
      async () => {
        const response = await aggregator!.post('query', {
          json: {
            src: input.src,
            dst: input.dst,
            measurements: NETWORK_MEASUREMENTS[input.network],
            ...getQueryWindow(input.range),
          },
        });
        if (!response.ok) return null;

        const text = (await response.text()).trim();
        return text.split('\n').map(parseLine);
      },
      getCacheExpiry(input.range),
    );
  }),

  baseline: publicProcedure.input(baselineInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const cacheKey = `baseline:${shaHash(JSON.stringify(input))}`;
    return memoize(
      cacheKey,
      async () => {
        const response = await aggregator!.post('query/baseline', {
          json: {
            src: input.src,
            ...getQueryWindow(input.range),
          },
        });
        if (!response.ok) return null;

        const text = (await response.text()).trim();
        if (!text) return [];
        return text.split('\n').map(parseLine);
      },
      getCacheExpiry(input.range),
    );
  }),

  errors: publicProcedure.input(chartInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const cacheKey = `errors:${shaHash(JSON.stringify(input))}`;
    return memoize(
      cacheKey,
      async () => {
        const response = await aggregator!.post('query/errors', {
          json: {
            src: input.src,
            dst: input.dst,
            network: input.network,
            ...getQueryWindow(input.range),
          },
        });
        if (!response.ok) return null;

        const text = (await response.text()).trim();
        if (!text) return [];
        return text.split('\n').map(parseErrorLine);
      },
      getCacheExpiry(input.range),
    );
  }),
});
