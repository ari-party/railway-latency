import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';
import { memoize } from '@/server/utils/memoize';

import type { MtrResultsDictionary } from '@railway-latency/types';

export const mtrRouter = createTRPCRouter({
  data: publicProcedure.query(async (): Promise<MtrResultsDictionary> => {
    if (!aggregator) return {};

    return memoize(
      'mtr:last',
      async () => {
        const response = await aggregator!.post('mtr/last');
        if (!response.ok) return {} as MtrResultsDictionary;

        return (await response.json()) as MtrResultsDictionary;
      },
      60,
    );
  }),
});
