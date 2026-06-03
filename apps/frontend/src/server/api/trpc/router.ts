import { chartRouter } from '@/server/api/trpc/routers/chart';
import { mtrRouter } from '@/server/api/trpc/routers/mtr';
import { regionsRouter } from '@/server/api/trpc/routers/regions';
import { tableRouter } from '@/server/api/trpc/routers/table';

import { createTRPCRouter } from './context';

export const appRouter = createTRPCRouter({
  chart: chartRouter,
  mtr: mtrRouter,
  regions: regionsRouter,
  table: tableRouter,
});

export type AppRouter = typeof appRouter;
