import { createNextApiHandler } from '@trpc/server/adapters/next';

import { env } from '@/env';
import { appRouter } from '@/server/api/trpc/router';

export default createNextApiHandler({
  router: appRouter,
  onError:
    env.NODE_ENV === 'development'
      ? ({ error, path }) => {
          console.error(
            `❌ tRPC failed on ${path ?? '<no-path>'}: ${error.message}`,
          );
        }
      : undefined,
});
