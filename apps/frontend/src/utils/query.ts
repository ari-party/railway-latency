import { RANGES } from '@railway-latency/utils';

import type { Network } from '@railway-latency/types';

export const DEFAULT_RANGE = '3h';

export const FRONTEND_RANGES = ['live', ...RANGES] as const;
export type FrontendRange = (typeof FRONTEND_RANGES)[number];

export const RANGE_WINDOW_MS: Record<FrontendRange, number> = {
  live: 500,
  '15m': 1_000,
  '3h': 10_000,
  '1d': 60_000,
  '7d': 600_000,
  '30d': 3_600_000,
};

export const NETWORKS = [
  'private',
  'public',
  'proxied',
] as const satisfies readonly Network[];

export function coerceNetwork(value: string): Network {
  return (NETWORKS as readonly string[]).includes(value)
    ? (value as Network)
    : 'private';
}

export function coerceRange(value: unknown): FrontendRange {
  return typeof value === 'string' &&
    (FRONTEND_RANGES as readonly string[]).includes(value)
    ? (value as FrontendRange)
    : DEFAULT_RANGE;
}
