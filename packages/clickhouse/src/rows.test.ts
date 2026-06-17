import { describe, expect, it } from 'vitest';

import { buildCheckEventRow } from '@/rows';

import type { CheckEvent } from '@railway-latency/types';

const base: CheckEvent = {
  dst: 'europe-west4',
  network: 'public',
  time: 1_700_000_000_000,
};

describe('buildCheckEventRow', () => {
  it('maps an HTTP-reached check with status and diagnostic headers', () => {
    const row = buildCheckEventRow('probe-iad', {
      ...base,
      httpStatus: 200,
      dnsMs: 2,
      handshakeMs: 38,
      httpMs: 312,
      railwayEdge: 'iad',
      cfPop: 'SIN',
      requestId: 'req_9b2',
    });
    expect(row).toMatchObject({
      src: 'probe-iad',
      dst: 'europe-west4',
      network: 'public',
      fail_stage: '',
      http_status: 200,
      dns_ms: 2,
      handshake_ms: 38,
      http_ms: 312,
      railway_edge: 'iad',
      cf_pop: 'SIN',
      request_id: 'req_9b2',
      body: '',
      body_truncated: false,
    });
    expect(row.time).toBe('2023-11-14 22:13:20.000');
  });

  it('maps a DNS-stage failure with no status, headers, or body', () => {
    const row = buildCheckEventRow('probe-iad', {
      ...base,
      failStage: 'dns',
      reason: 'dns lookup failed',
      dnsMs: 51,
    });
    expect(row.fail_stage).toBe('dns');
    expect(row.http_status).toBeNull();
    expect(row.headers).toEqual({});
    expect(row.body).toBe('');
  });

  it('carries full headers and body for a non-2xx response', () => {
    const row = buildCheckEventRow('probe-iad', {
      ...base,
      httpStatus: 503,
      headers: { 'x-railway-edge': 'iad', 'cf-ray': '8f2-SJC' },
      body: '{"error":"upstream"}',
      bodyTruncated: true,
    });
    expect(row.http_status).toBe(503);
    expect(row.headers).toEqual({
      'x-railway-edge': 'iad',
      'cf-ray': '8f2-SJC',
    });
    expect(row.body).toBe('{"error":"upstream"}');
    expect(row.body_truncated).toBe(true);
  });
});
