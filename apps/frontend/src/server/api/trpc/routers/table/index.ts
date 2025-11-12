import EventEmitter, { on } from 'node:events';

import { getEmptyProbeResultsDictionary } from '@railway-latency/utils';
import ky from 'ky';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';

import type { ProbeResultsDictionary } from '@railway-latency/types';

const events = new EventEmitter<{ data: [ProbeResultsDictionary] }>();
let data: ProbeResultsDictionary = getEmptyProbeResultsDictionary([
  'dc-1',
  'dc-2',
  'dc-3',
]);

if (env.NODE_ENV !== 'development' && env.AGGREGATOR_HOST) {
  async function fetchData() {
    try {
      const response = await ky
        .get(`http://${env.AGGREGATOR_HOST}:8080/query/last`)
        .json();
      data = response as typeof data;

      events.emit('data', data);
    } catch (err) {
      console.error(err);
    }
  }

  fetchData().finally(() => {
    setIntervalAsync(fetchData, 5_000);
  });
}

export const tableRouter = createTRPCRouter({
  data: publicProcedure.query(() => {
    return data;
  }),

  onChange: publicProcedure.subscription(async function* ({ signal }) {
    for await (const [data] of on(events, 'data', { signal }))
      yield data as unknown as ProbeResultsDictionary;
  }),
});
