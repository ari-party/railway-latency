import { createTRPCRouter } from '@/server/api/trpc/context';
import { alertsRouter } from '@/server/api/trpc/routers/alerts';
import { chartRouter } from '@/server/api/trpc/routers/chart';
import { checksRouter } from '@/server/api/trpc/routers/checks';
import { mtrRouter } from '@/server/api/trpc/routers/mtr';
import { probesRouter } from '@/server/api/trpc/routers/probes';
import { regionsRouter } from '@/server/api/trpc/routers/regions';
import { tableRouter } from '@/server/api/trpc/routers/table';

export const appRouter = createTRPCRouter({
  alerts: alertsRouter,
  chart: chartRouter,
  checks: checksRouter,
  mtr: mtrRouter,
  probes: probesRouter,
  regions: regionsRouter,
  table: tableRouter,
});

export type AppRouter = typeof appRouter;
