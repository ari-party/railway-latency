import type { CheckEvent } from '@railway-latency/types';

export interface CheckEventRow {
  time: string;
  src: string;
  dst: string;
  network: string;
  fail_stage: string;
  reason: string;
  dns_ms: number | null;
  handshake_ms: number | null;
  http_ms: number | null;
  http_status: number | null;
  railway_edge: string;
  cf_pop: string;
  hikari_pop: string;
  request_id: string;
  headers: Record<string, string>;
  body: string;
  body_truncated: boolean;
}

function toClickHouseDateTime(unixMs: number): string {
  return new Date(unixMs).toISOString().replace('T', ' ').replace('Z', '');
}

export function buildCheckEventRow(
  src: string,
  event: CheckEvent,
): CheckEventRow {
  return {
    time: toClickHouseDateTime(event.time),
    src,
    dst: event.dst,
    network: event.network,
    fail_stage: event.failStage ?? '',
    reason: event.reason ?? '',
    dns_ms: event.dnsMs ?? null,
    handshake_ms: event.handshakeMs ?? null,
    http_ms: event.httpMs ?? null,
    http_status: event.httpStatus ?? null,
    railway_edge: event.railwayEdge ?? '',
    cf_pop: event.cfPop ?? '',
    hikari_pop: event.hikariPop ?? '',
    request_id: event.requestId ?? '',
    headers: event.headers ?? {},
    body: event.body ?? '',
    body_truncated: event.bodyTruncated ?? false,
  };
}
