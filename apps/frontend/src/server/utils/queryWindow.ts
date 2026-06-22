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
