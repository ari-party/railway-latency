import { RANGES } from '@railway-latency/utils';

import type { Network } from '@railway-latency/types';

export const DEFAULT_RANGE = '3h';

export const FRONTEND_RANGES = ['live', ...RANGES] as const;
export type FrontendRange = (typeof FRONTEND_RANGES)[number];

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
