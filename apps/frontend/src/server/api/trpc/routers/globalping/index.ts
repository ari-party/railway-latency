import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { env } from '@/env';
import {
  createTRPCRouter,
  protectedProcedure,
} from '@/server/api/trpc/context';

import { createMeasurement, fetchProbes, pollMeasurement } from './client';
import { buildLocationTree, toGlobalpingLocation } from './locations';
import { parseProbeResults, targetHost } from './parse';
import { withRunLock } from './queue';
import { getResult, listRecent, storeResult } from './store';

import type { GlobalpingResult, LocationTree } from './types';

const DEFAULT_LIMIT = 10;

const measureInput = z.object({
  type: z.enum(['http', 'mtr']),
  dst: z.string().max(64),
  location: z.object({
    continent: z.string().max(8).optional(),
    country: z.string().max(8).optional(),
    city: z.string().max(64).optional(),
    network: z.string().max(128).optional(),
  }),
  limit: z.number().int().min(1).max(50).default(DEFAULT_LIMIT),
});

export const globalpingRouter = createTRPCRouter({
  locations: protectedProcedure.query(async (): Promise<LocationTree> => {
    try {
      return buildLocationTree(await fetchProbes());
    } catch {
      return { continents: [], networks: [] };
    }
  }),

  list: protectedProcedure.query(() => listRecent()),

  get: protectedProcedure
    .input(z.object({ id: z.string().max(128) }))
    .query(({ input }) => getResult(input.id)),

  measure: protectedProcedure
    .input(measureInput)
    .mutation(async ({ input }): Promise<GlobalpingResult> => {
      const regions = env.RAILWAY_REPLICA_REGIONS ?? [];
      if (!regions.includes(input.dst))
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Unknown destination region',
        });

      const location = toGlobalpingLocation(input.location);
      if (Object.keys(location).length === 0)
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Pick a probe location',
        });

      const target = targetHost(input.dst, env.RAILWAY_ENVIRONMENT_NAME);

      return withRunLock(async () => {
        const id = await createMeasurement({
          type: input.type,
          target,
          location,
          limit: input.limit,
        });
        const { results } = await pollMeasurement(id);
        const built: GlobalpingResult = {
          id,
          type: input.type,
          dst: input.dst,
          target,
          location: input.location,
          createdAt: Date.now(),
          probes: parseProbeResults(input.type, results),
        };
        await storeResult(built);
        return built;
      });
    }),
});
