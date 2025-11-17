import EventEmitter, { on } from 'node:events';

import { getEmptyProbeResultsDictionary } from '@railway-latency/utils';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import { aggregator } from '@/server/services/aggregator';

import type { ProbeResultsDictionary } from '@railway-latency/types';

const events = new EventEmitter<{ data: [ProbeResultsDictionary] }>();
let data: ProbeResultsDictionary = getEmptyProbeResultsDictionary([
  'dc-1',
  'dc-2',
  'dc-3',
]);

if (env.NODE_ENV !== 'development' && aggregator) {
  async function fetchData() {
    try {
      const response = await aggregator!.post(`query/last`).json();
      data = response as typeof data;

      events.emit('data', data);
    } catch (err) {
      console.error(err);
    }
  }

  await fetchData().finally(() => {
    setIntervalAsync(fetchData, 5_000);
  });
}

export const tableRouter = createTRPCRouter({
  data: publicProcedure.query(() => {
    return data;
  }),

  onChange: publicProcedure.subscription(async function* ({ signal }) {
    events.setMaxListeners(events.getMaxListeners() + 1);
    signal?.addEventListener(
      'abort',
      () => {
        events.setMaxListeners(events.getMaxListeners() - 1);
      },
      { once: true },
    );

    for await (const [data] of on(events, 'data', { signal }))
      yield data as unknown as ProbeResultsDictionary;
  }),
});
