import Redis from 'ioredis';

import { env } from '@/env';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (attempt) => Math.min(attempt * 500, 5_000),
});

redis.on('error', () => {});
