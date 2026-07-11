import { createTRPCRouter } from '@/server/api/trpc/context';
import { chartRouter } from '@/server/api/trpc/routers/chart';
import { checksRouter } from '@/server/api/trpc/routers/checks';
import { metricsRouter } from '@/server/api/trpc/routers/metrics';
import { mtrRouter } from '@/server/api/trpc/routers/mtr';
import { popsRouter } from '@/server/api/trpc/routers/pops';
import { probesRouter } from '@/server/api/trpc/routers/probes';
import { regionsRouter } from '@/server/api/trpc/routers/regions';
import { sessionRouter } from '@/server/api/trpc/routers/session';
import { tableRouter } from '@/server/api/trpc/routers/table';

export const appRouter = createTRPCRouter({
  chart: chartRouter,
  checks: checksRouter,
  metrics: metricsRouter,
  mtr: mtrRouter,
  pops: popsRouter,
  probes: probesRouter,
  regions: regionsRouter,
  session: sessionRouter,
  table: tableRouter,
});

export type AppRouter = typeof appRouter;
