import { RANGES } from '@railway-latency/utils';
import z from 'zod';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { shaHash } from '@/server/utils/hash';
import { memoize } from '@/server/utils/memoize';
import { RANGE_WINDOW_MS } from '@/utils/query';

import type { FrontendRange } from '@/utils/query';
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

function fluxDuration(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}

function getWindow(range: Range | string): {
  aggregateWindow: string;
  rangeStart: string;
} | null {
  const windowMs = RANGE_WINDOW_MS[range as FrontendRange];
  if (windowMs == null) return null;

  const aggregateWindow = fluxDuration(windowMs);
  const now = new Date();

  switch (range) {
    case 'live':
      return {
        aggregateWindow,
        rangeStart: new Date(now.getTime() - 5 * 60 * 1000).toISOString(),
      };
    case '15m':
      return {
        aggregateWindow,
        rangeStart: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
      };
    case '3h':
      return {
        aggregateWindow,
        rangeStart: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      };
    case '1d':
      return {
        aggregateWindow,
        rangeStart: new Date(
          now.getTime() - 1 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    case '7d':
      return {
        aggregateWindow,
        rangeStart: new Date(
          now.getTime() - 7 * 24 * 60 * 60 * 1000,
        ).toISOString(),
      };
    case '30d':
      return {
        aggregateWindow,
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

function parseErrorLine(line: string): QueryErrorLine {
  const comma = line.indexOf(',');
  return [line.slice(0, comma), line.slice(comma + 1)];
}

function getCacheExpiry(range: Range | 'live'): number {
  if (range === 'live') return 1;

  return RANGES.indexOf(range) === 0 ? 10 : 60;
}

const chartInput = z.object({
  src: replicaRegionsEnum,
  dst: replicaRegionsEnum,
  range: z.enum(QUERY_RANGES),
  network: z.enum(['private', 'public', 'proxied']).default('private'),
});

export const chartRouter = createTRPCRouter({
  query: publicProcedure.input(chartInput).query(async ({ input }) => {
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

  errors: publicProcedure.input(chartInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const window = getWindow(input.range);
    if (!window) return null;

    const cacheKey = `errors:${shaHash(JSON.stringify(input))}`;
    return memoize(
      cacheKey,
      async () => {
        const response = await aggregator!.post('query/errors', {
          json: {
            src: input.src,
            dst: input.dst,
            network: input.network,
            rangeEnd: new Date().toISOString(),
            ...window,
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
