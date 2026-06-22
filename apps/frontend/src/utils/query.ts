import { RANGES } from '@railway-latency/utils';

import type { Network } from '@railway-latency/types';

export const DEFAULT_RANGE = '3h';

export const FRONTEND_RANGES = ['live', ...RANGES] as const;
export type FrontendRange = (typeof FRONTEND_RANGES)[number];

export const RANGE_WINDOW_MS: Record<FrontendRange, number> = {
  live: 500,
  '15m': 2_500,
  '3h': 10 * 1_000,
  '1d': 60 * 1_000,
  '7d': 10 * 60 * 1_000,
  '30d': 60 * 60 * 1_000,
};

export const RANGE_LOOKBACK_MS: Record<FrontendRange, number> = {
  live: 15 * 60 * 1_000,
  '15m': 15 * 60 * 1_000,
  '3h': 3 * 60 * 60 * 1_000,
  '1d': 24 * 60 * 60 * 1_000,
  '7d': 7 * 24 * 60 * 60 * 1_000,
  '30d': 30 * 24 * 60 * 60 * 1_000,
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
