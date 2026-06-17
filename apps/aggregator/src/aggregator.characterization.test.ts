import { dateToProtocolTimestamp } from '@influxdata/influxdb-client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Point } from '@influxdata/influxdb-client';
import type { ErrorEvent, ProbeSample } from '@railway-latency/types';

const writePoints = vi.fn<(points: Point[]) => void>();

vi.mock('@/env', () => ({
  env: {
    RAILWAY_REPLICA_REGIONS: ['europe-west4', 'asia-southeast1'],
    INFLUXDB_URL: 'http://influx.local:8086',
    INFLUXDB_TOKEN: 'token',
    INFLUXDB_ORG: 'railway',
    INFLUXDB_BUCKET: 'latency',
  },
}));

vi.mock('@/services/influxdb', () => ({
  writeAPI: { writePoints },
}));

vi.mock('@/services/clickhouse', () => ({
  writeChecks: vi.fn(),
}));

// aggregator.ts schedules three live setIntervalAsync timers and a ky client at
// import time; stub both so importing it under test makes no network calls and
// leaks no interval handles.
vi.mock('set-interval-async', () => ({
  setIntervalAsync: vi.fn(() => ({})),
  clearIntervalAsync: vi.fn(),
}));

vi.mock('ky', () => ({
  default: { create: vi.fn(() => ({ get: vi.fn() })) },
}));

// The real write path serializes through getWriteApi(org, bucket, 'ms'), so a
// point's timestamp lands as a millisecond value, not the library's nanosecond
// default. Drive the assertion through the same ms converter so this pins what
// the real code emits (ns -> ms is intentional).
function linesOf(call: Point[]): string[] {
  return call.map(
    (point) =>
      point.toLineProtocol({
        convertTime: (value) => dateToProtocolTimestamp.ms(new Date(value!)),
      }) ?? '',
  );
}

describe('aggregator write path (characterization)', () => {
  beforeEach(() => {
    writePoints.mockClear();
  });

  it('writeSamples emits one point per sample with src/dst tags and ms field', async () => {
    const { writeSamples } = await import('@/aggregator');

    const samples: ProbeSample[] = [
      {
        measurement: 'httpPublic',
        dst: 'asia-southeast1',
        time: 1_700_000_000_000,
        ms: 12.5,
        railwayEdge: 'edge-1',
        cfPop: 'AMS',
        hikariPop: 'sin',
      },
    ];

    writeSamples('europe-west4', samples);

    expect(writePoints).toHaveBeenCalledTimes(1);
    expect(linesOf(writePoints.mock.calls[0]![0])).toEqual([
      'httpPublic,dst=asia-southeast1,src=europe-west4 cf_pop="AMS",hikari_pop="sin",ms=12.5,railway_edge="edge-1" 1700000000000',
    ]);
  });

  it('writeSamples omits absent optional fields and writes nothing for an empty batch', async () => {
    const { writeSamples } = await import('@/aggregator');

    writeSamples('europe-west4', [
      {
        measurement: 'dnsProxied',
        dst: 'asia-southeast1',
        time: 1_700_000_000_001,
        ms: 4,
      },
    ]);

    expect(linesOf(writePoints.mock.calls[0]![0])).toEqual([
      'dnsProxied,dst=asia-southeast1,src=europe-west4 ms=4 1700000000001',
    ]);

    writePoints.mockClear();
    writeSamples('europe-west4', []);
    expect(writePoints).not.toHaveBeenCalled();
  });

  it('writeErrors emits measurement "error" with src/dst/network tags and reason', async () => {
    const { writeErrors } = await import('@/aggregator');

    const errors: ErrorEvent[] = [
      {
        dst: 'asia-southeast1',
        network: 'public',
        time: 1_700_000_000_000,
        reason: 'connection reset',
      },
    ];

    writeErrors('europe-west4', errors);

    expect(writePoints).toHaveBeenCalledTimes(1);
    expect(linesOf(writePoints.mock.calls[0]![0])).toEqual([
      'error,dst=asia-southeast1,network=public,src=europe-west4 reason="connection reset" 1700000000000',
    ]);

    writePoints.mockClear();
    writeErrors('europe-west4', []);
    expect(writePoints).not.toHaveBeenCalled();
  });
});

describe('aggregator line-protocol sanitization', () => {
  beforeEach(() => {
    writePoints.mockClear();
  });

  // Not characterization: this pins the control-char stripping introduced with
  // the external-probes work, not prior production behavior.
  it('strips embedded line-protocol control characters from string fields', async () => {
    const { writeErrors } = await import('@/aggregator');

    const errors: ErrorEvent[] = [
      {
        dst: 'asia-southeast1',
        network: 'public',
        time: 1_700_000_000_000,
        reason: 'connection\r\nreset\tby peer',
      },
    ];

    writeErrors('europe-west4', errors);

    expect(linesOf(writePoints.mock.calls[0]![0])).toEqual([
      'error,dst=asia-southeast1,network=public,src=europe-west4 reason="connection  reset by peer" 1700000000000',
    ]);
  });
});
