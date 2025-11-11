import ky from 'ky';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { publicProcedure } from '@/server/api/trpc/context';

let data: Record<string, Record<string, number | null>> = {};

setIntervalAsync(async () => {
  try {
    const response = await ky
      .get(`http://${env.AGGREGATOR_HOST}:8080/query/last`)
      .json();
    data = response as typeof data;
  } catch (err) {
    console.error(err);
  }
}, 5_000);

export const dataRouter = publicProcedure.query(() => {
  return data;
});
