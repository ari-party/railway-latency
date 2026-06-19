import { toClickHouseDateTime } from '@/clickhouseTime';

import type { ErrorEvent } from '@railway-latency/types';

export interface ErrorEventRow {
  time: string;
  src: string;
  dst: string;
  network: string;
  origin: string;
  reason: string;
}

export function buildErrorEventRow(
  src: string,
  event: ErrorEvent,
  origin: string,
): ErrorEventRow {
  return {
    time: toClickHouseDateTime(event.time),
    src,
    dst: event.dst,
    network: event.network,
    origin,
    reason: event.reason,
  };
}
