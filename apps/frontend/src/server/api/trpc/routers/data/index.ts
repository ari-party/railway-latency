import ky from 'ky';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { publicProcedure } from '@/server/api/trpc/context';

type Results = Record<string, number | null>;
interface ProbeResults {
  http: Results;
  dns: Results;
}
let data: Record<string, ProbeResults> = {};

if (env.NODE_ENV !== 'development') {
  async function fetchData() {
    try {
      const response = await ky
        .get(`http://${env.AGGREGATOR_HOST}:8080/query/last`)
        .json();
      data = response as typeof data;
    } catch (err) {
      console.error(err);
    }
  }

  fetchData().finally(() => {
    setIntervalAsync(fetchData, 5_000);
  });
}

export const dataRouter = publicProcedure.query(() => {
  return data;
});
