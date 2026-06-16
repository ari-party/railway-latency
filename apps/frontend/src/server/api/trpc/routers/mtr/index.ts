import z from 'zod';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';

const replicaRegionsEnum = z.enum(
  (env.RAILWAY_REPLICA_REGIONS as [string, ...string[]]) || [],
);

const nodeSchema = z
  .string()
  .max(64)
  .regex(/^[a-z0-9][a-z0-9-]*$/);

const mtrInput = z.object({
  src: nodeSchema,
  dst: replicaRegionsEnum,
  network: z.enum(['public', 'proxied']),
});

const mtrHopSchema = z.object({
  hop: z.number(),
  ip: z.string().optional(),
  ms: z.number().optional(),
});

const mtrResultSchema = z
  .object({
    time: z.string(),
    hops: z.array(mtrHopSchema),
  })
  .nullable();

export const mtrRouter = createTRPCRouter({
  latest: publicProcedure.input(mtrInput).query(async ({ input }) => {
    if (!aggregator) return null;

    const response = await aggregator.post('query/mtr', {
      json: { src: input.src, dst: input.dst, network: input.network },
    });
    if (!response.ok) return null;

    const parsed = mtrResultSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  }),
});
