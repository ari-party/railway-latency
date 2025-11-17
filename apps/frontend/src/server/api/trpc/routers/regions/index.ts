import { env } from '@/env';
import { publicProcedure } from '@/server/api/trpc/context';

export const regionsRouter = publicProcedure.query(
  () => env.RAILWAY_REPLICA_REGIONS ?? [],
);
