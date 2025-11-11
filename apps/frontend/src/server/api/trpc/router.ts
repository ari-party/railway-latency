import { createTRPCRouter } from './context';

import { dataRouter } from '@/server/api/trpc/routers/data';

export const appRouter = createTRPCRouter({
  data: dataRouter,
});

export type AppRouter = typeof appRouter;
