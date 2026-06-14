import EventEmitter, { on } from 'node:events';

import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { createTRPCRouter, publicProcedure } from '@/server/api/trpc/context';
import {
  SNAPSHOT_LOOKBACK,
  SNAPSHOT_WINDOW,
} from '@/server/api/trpc/routers/alerts/config';
import { evaluate } from '@/server/api/trpc/routers/alerts/evaluate';
import { aggregator } from '@/server/services/aggregator';

import type { Alert, Snapshot } from '@/server/api/trpc/routers/alerts/config';

const events = new EventEmitter<{ data: [Alert[]] }>();
let alerts: Alert[] = [];

if (env.NODE_ENV !== 'development' && aggregator) {
  async function fetchAlerts() {
    try {
      const snapshot = await aggregator!
        .get('alerts/snapshot', {
          searchParams: {
            window: SNAPSHOT_WINDOW,
            lookback: SNAPSHOT_LOOKBACK,
          },
        })
        .json<Snapshot>();

      alerts = evaluate(snapshot);
      events.emit('data', alerts);
    } catch (err) {
      console.error(err);
    }
  }

  await fetchAlerts().finally(() => {
    setIntervalAsync(fetchAlerts, 5_000);
  });
}

export const alertsRouter = createTRPCRouter({
  data: publicProcedure.query(() => alerts),

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
      yield data as unknown as Alert[];
  }),
});
