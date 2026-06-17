import type { Network } from './wire';

export interface CheckEventListRow {
  time: number;
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
  body_truncated: boolean;
}

export interface CheckEventDetailRow extends CheckEventListRow {
  headers: Record<string, string>;
  body: string;
}

export interface CheckEvent {
  dst: string;
  network: Network;
  time: number;
  failStage?: 'dns' | 'handshake' | 'http';
  reason?: string;
  dnsMs?: number;
  handshakeMs?: number;
  httpMs?: number;
  httpStatus?: number;
  railwayEdge?: string;
  cfPop?: string;
  hikariPop?: string;
  requestId?: string;
  headers?: Record<string, string>;
  body?: string;
  bodyTruncated?: boolean;
}
