import { tableRouter } from '@/server/api/trpc/routers/table';

import { createTRPCRouter } from './context';

export const appRouter = createTRPCRouter({
  table: tableRouter,
});

export type AppRouter = typeof appRouter;
