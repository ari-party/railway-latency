import { httpBatchLink, httpLink, splitLink } from '@trpc/client';
import superjson from 'superjson';

import type { AppRouter } from '@/server/api/trpc/router';

export function createHttpTransport(options: {
  url: string;
  headers: () => Record<string, string | undefined>;
  fetch?: Parameters<typeof httpLink<AppRouter>>[0]['fetch'];
}) {
  const httpOptions = { ...options, transformer: superjson };

  return splitLink<AppRouter>({
    condition: (op) => op.context.skipBatch === true,
    true: httpLink<AppRouter>(httpOptions),
    false: httpBatchLink<AppRouter>(httpOptions),
  });
}
