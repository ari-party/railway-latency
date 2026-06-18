import z from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { FRONTEND_RANGES } from '@/utils/query';

import type { FrontendRange } from '@/utils/query';

const nodeSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const aggregatorCursorSchema = z.object({
  time: z.number().int(),
  src: z.string().max(64),
  dst: z.string().max(64),
  network: z.enum(['private', 'public', 'proxied']),
});

// Carries page 1's window floor so every page shares one `from`; recomputing it
// per request creeps the floor forward and halts pagination before the range start.
const clientCursorSchema = aggregatorCursorSchema.extend({
  from: z.number().int(),
});

const RANGE_LOOKBACK_MS: Record<FrontendRange, number> = {
  live: 15 * 60 * 1_000,
  '15m': 15 * 60 * 1_000,
  '3h': 3 * 60 * 60 * 1_000,
  '1d': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
};

const queryInput = z.object({
  query: z.string().max(512).default(''),
  range: z.enum(FRONTEND_RANGES),
  cursor: clientCursorSchema.optional(),
  limit: z.number().int().min(1).max(200).default(100),
});

const detailInput = z.object({
  time: z.number().int(),
  src: nodeSchema,
  dst: nodeSchema,
  network: z.enum(['private', 'public', 'proxied']),
});

const checkEventListRowSchema = z.object({
  time: z.number(),
  src: z.string(),
  dst: z.string(),
  network: z.string(),
  fail_stage: z.string(),
  reason: z.string(),
  dns_ms: z.number().nullable(),
  handshake_ms: z.number().nullable(),
  http_ms: z.number().nullable(),
  http_status: z.number().nullable(),
  railway_edge: z.string(),
  cf_pop: z.string(),
  hikari_pop: z.string(),
  request_id: z.string(),
  body_truncated: z.boolean(),
});

const checkEventDetailRowSchema = checkEventListRowSchema.extend({
  headers: z.record(z.string(), z.string()),
  body: z.string(),
});

const aggregatorPageSchema = z.object({
  rows: z.array(checkEventListRowSchema),
  cursor: aggregatorCursorSchema.nullable(),
});

export const checksRouter = createTRPCRouter({
  query: publicProcedure.input(queryInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const from =
      input.cursor?.from ?? Date.now() - RANGE_LOOKBACK_MS[input.range];
    const cursor = input.cursor
      ? {
          time: input.cursor.time,
          src: input.cursor.src,
          dst: input.cursor.dst,
          network: input.cursor.network,
        }
      : undefined;

    const response = await aggregator.post('query/checks', {
      json: { query: input.query, from, cursor, limit: input.limit },
    });
    if (!response.ok) return null;

    const parsed = aggregatorPageSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(
        'checks.query: malformed aggregator response',
        parsed.error,
      );
      return null;
    }

    const nextCursor = parsed.data.cursor
      ? { ...parsed.data.cursor, from }
      : null;
    return { rows: parsed.data.rows, cursor: nextCursor };
  }),

  detail: publicProcedure.input(detailInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const response = await aggregator.post('query/checks/detail', {
      json: input,
    });
    if (!response.ok) return null;

    const parsed = checkEventDetailRowSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(
        'checks.detail: malformed aggregator response',
        parsed.error,
      );
      return null;
    }

    return parsed.data;
  }),
});
