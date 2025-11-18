import { EventSource } from 'eventsource';
import ky from 'ky';

import { env } from '@/env';

import type { KyInstance } from 'ky';

const aggregatorHost = env.AGGREGATOR_HOST;

const aggregatorProtocol =
  aggregatorHost && aggregatorHost.endsWith('railway.internal')
    ? 'http'
    : 'https';

const aggregatorBaseUrl =
  aggregatorHost != null
    ? `${aggregatorProtocol}://${aggregatorHost}:${env.AGGREGATOR_PORT}`
    : undefined;

export const aggregator: KyInstance | null = aggregatorBaseUrl
  ? ky.create({
      prefixUrl: aggregatorBaseUrl,
      throwHttpErrors: false,
    })
  : null;

export const aggregatorEvents = new EventSource(
  `${aggregatorBaseUrl}/stream/events`,
);
