import { publicProcedure } from '@/server/api/trpc/context';
import { isAuthEnabled } from '@/server/auth/oauth';

export const sessionRouter = publicProcedure.query(({ ctx }) => ({
  enabled: isAuthEnabled(),
  user: ctx.user,
}));
