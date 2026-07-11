import ky from 'ky';

import { env } from '@/env';

import type { KyInstance } from 'ky';

export const globalping: KyInstance = ky.create({
  prefixUrl: 'https://api.globalping.io/v1',
  throwHttpErrors: false,
  timeout: 15_000,
  headers: env.GLOBALPING_API_KEY
    ? { authorization: `Bearer ${env.GLOBALPING_API_KEY}` }
    : undefined,
});
