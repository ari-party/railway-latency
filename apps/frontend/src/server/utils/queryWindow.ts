import { RANGE_LOOKBACK_MS, RANGE_WINDOW_MS } from '@/utils/query';

import type { FrontendRange } from '@/utils/query';

function fluxDuration(ms: number): string {
  if (ms % 3_600_000 === 0) return `${ms / 3_600_000}h`;
  if (ms % 60_000 === 0) return `${ms / 60_000}m`;
  if (ms % 1_000 === 0) return `${ms / 1_000}s`;
  return `${ms}ms`;
}

export function getQueryWindow(range: FrontendRange): {
  aggregateWindow: string;
  rangeStart: string;
  rangeEnd: string;
} {
  const now = Date.now();

  return {
    aggregateWindow: fluxDuration(RANGE_WINDOW_MS[range]),
    rangeStart: new Date(now - RANGE_LOOKBACK_MS[range]).toISOString(),
    rangeEnd: new Date(now).toISOString(),
  };
}

// The pops chart draws many probe×region series at once, so it aggregates into
// coarser buckets (~this many per series) to keep the payload small.
const POPS_MAX_BUCKETS = 150;

export function getPopsQueryWindow(range: FrontendRange): {
  aggregateWindow: string;
  rangeStart: string;
  rangeEnd: string;
} {
  const now = Date.now();
  const lookbackMs = RANGE_LOOKBACK_MS[range];
  const secondsPerBucket = Math.max(
    1,
    Math.ceil(lookbackMs / POPS_MAX_BUCKETS / 1_000),
  );
  const windowMs = Math.max(RANGE_WINDOW_MS[range], secondsPerBucket * 1_000);

  return {
    aggregateWindow: fluxDuration(windowMs),
    rangeStart: new Date(now - lookbackMs).toISOString(),
    rangeEnd: new Date(now).toISOString(),
  };
}
