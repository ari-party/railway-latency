import { TRPCError, initTRPC } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';

import {
  SESSION_COOKIE_NAME,
  isEmailAllowed,
  verifySessionToken,
} from '@/server/auth/session';

import type { CreateNextContextOptions } from '@trpc/server/adapters/next';

export async function createContext({ req }: CreateNextContextOptions) {
  return { user: await verifySessionToken(req.cookies[SESSION_COOKIE_NAME]) };
}

export type Context = Awaited<ReturnType<typeof createContext>>;

const t = initTRPC.context<Context>().create({
  errorFormatter({ error, shape }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
  transformer: superjson,
});

export const createCallerFactory = t.createCallerFactory;

export const createTRPCRouter = t.router;

export const publicProcedure = t.procedure;

export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: 'UNAUTHORIZED' });
  if (!isEmailAllowed(ctx.user.email))
    throw new TRPCError({ code: 'FORBIDDEN' });

  return next({ ctx: { ...ctx, user: ctx.user } });
});
