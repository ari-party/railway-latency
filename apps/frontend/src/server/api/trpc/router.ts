import { dataRouter } from '@/server/api/trpc/routers/data';

import { createTRPCRouter } from './context';

export const appRouter = createTRPCRouter({
  data: dataRouter,
});

export type AppRouter = typeof appRouter;
