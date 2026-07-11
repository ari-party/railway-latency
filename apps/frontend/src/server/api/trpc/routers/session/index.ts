import { publicProcedure } from '@/server/api/trpc/context';

export const sessionRouter = publicProcedure.query(({ ctx }) => ctx.user);
