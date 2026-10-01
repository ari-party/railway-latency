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

// The pops chart draws many probe×region series at once, so it aggregates into
// coarser buckets (~this many per series) to keep the payload small.
const POPS_MAX_BUCKETS = 150;

export function getPopsQueryWindow(range: FrontendRange): {
  windowMs: number;
  rangeStart: string;
  rangeEnd: string;
} {
  const now = Date.now();
  const lookbackMs = RANGE_LOOKBACK_MS[range];
  const secondsPerBucket = Math.max(
    1,
    Math.ceil(lookbackMs / POPS_MAX_BUCKETS / 1_000),
  );

  return {
    windowMs: Math.max(RANGE_WINDOW_MS[range], secondsPerBucket * 1_000),
    rangeStart: new Date(now - lookbackMs).toISOString(),
    rangeEnd: new Date(now).toISOString(),
  };
}
