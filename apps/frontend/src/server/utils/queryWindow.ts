import { RANGE_LOOKBACK_MS, RANGE_WINDOW_MS } from '@/utils/query';

import type { FrontendRange } from '@/utils/query';

export function getQueryWindow(range: FrontendRange): {
  windowMs: number;
  rangeStart: string;
  rangeEnd: string;
} {
  const now = Date.now();

  return {
    windowMs: RANGE_WINDOW_MS[range],
    rangeStart: new Date(now - RANGE_LOOKBACK_MS[range]).toISOString(),
    rangeEnd: new Date(now).toISOString(),
  };
}

// The pops charts draw many series at once, so they aggregate into coarser
// buckets (~maxBuckets per series) to keep the payload small.
export const POPS_OVERVIEW_MAX_BUCKETS = 150;
export const POPS_DETAIL_MAX_BUCKETS = 500;

export function getPopsQueryWindow(
  range: FrontendRange,
  maxBuckets: number = POPS_OVERVIEW_MAX_BUCKETS,
): {
  windowMs: number;
  rangeStart: string;
  rangeEnd: string;
} {
  const now = Date.now();
  const lookbackMs = RANGE_LOOKBACK_MS[range];
  const secondsPerBucket = Math.max(
    1,
    Math.ceil(lookbackMs / maxBuckets / 1_000),
  );

  return {
    windowMs: Math.max(RANGE_WINDOW_MS[range], secondsPerBucket * 1_000),
    rangeStart: new Date(now - lookbackMs).toISOString(),
    rangeEnd: new Date(now).toISOString(),
  };
}
