import { alertsRouter } from '@/server/api/trpc/routers/alerts';
import { chartRouter } from '@/server/api/trpc/routers/chart';
import { regionsRouter } from '@/server/api/trpc/routers/regions';
import { tableRouter } from '@/server/api/trpc/routers/table';

import { createTRPCRouter } from './context';

export const appRouter = createTRPCRouter({
  alerts: alertsRouter,
  chart: chartRouter,
  regions: regionsRouter,
  table: tableRouter,
});

export type AppRouter = typeof appRouter;
