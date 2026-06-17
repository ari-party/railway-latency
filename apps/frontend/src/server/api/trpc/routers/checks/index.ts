import z from 'zod';

import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';

const nodeSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const filtersSchema = z.object({
  status: z
    .object({
      op: z.enum(['eq', 'gte', 'lte', 'gt', 'lt']),
      value: z.number().int(),
    })
    .optional(),
  failStage: z.enum(['dns', 'handshake', 'http']).optional(),
  network: z.enum(['private', 'public', 'proxied']).optional(),
  src: nodeSchema.optional(),
  dst: nodeSchema.optional(),
  edge: z.string().max(64).optional(),
  cf: z.string().max(64).optional(),
  hikari: z.string().max(64).optional(),
  hasBody: z.boolean().optional(),
  text: z.string().max(256).optional(),
});

const checkEventCursorSchema = z.object({
  time: z.number().int(),
  src: z.string().max(64),
  dst: z.string().max(64),
  network: z.enum(['private', 'public', 'proxied']),
});

const queryInput = z.object({
  filters: filtersSchema,
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  cursor: checkEventCursorSchema.optional(),
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

const checkPageSchema = z.object({
  rows: z.array(checkEventListRowSchema),
  cursor: checkEventCursorSchema.nullable(),
});

export const checksRouter = createTRPCRouter({
  query: publicProcedure.input(queryInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const response = await aggregator.post('query/checks', { json: input });
    if (!response.ok) return null;

    const parsed = checkPageSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error(
        'checks.query: malformed aggregator response',
        parsed.error,
      );
      return null;
    }

    return parsed.data;
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
