import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ErrorEvent, ProbeSample } from '@railway-latency/types';

const writeSampleRows = vi.fn();
const writeErrorRows = vi.fn();

vi.mock('@/env', () => ({
  env: {
    RAILWAY_REPLICA_REGIONS: ['europe-west4', 'asia-southeast1'],
    CLICKHOUSE_URL: 'http://ch.local:8123',
    CLICKHOUSE_USERNAME: 'default',
    CLICKHOUSE_PASSWORD: 'x',
    CLICKHOUSE_DATABASE: 'latency',
  },
}));

vi.mock('@/services/clickhouse', () => ({
  writeChecks: vi.fn(),
  writeSampleRows,
  writeErrorRows,
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

describe('aggregator write path (characterization)', () => {
  beforeEach(() => {
    writeSampleRows.mockClear();
    writeErrorRows.mockClear();
  });

  it('writeSamples forwards the batch to the ClickHouse sample writer', async () => {
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

    expect(writeSampleRows).toHaveBeenCalledTimes(1);
    expect(writeSampleRows).toHaveBeenCalledWith('europe-west4', samples);
  });

  it('writeSamples updates the in-memory lastResults dictionary by measurement type', async () => {
    const { writeSamples, getLastResults } = await import('@/aggregator');

    writeSamples('europe-west4', [
      {
        measurement: 'dnsProxied',
        dst: 'asia-southeast1',
        time: 1_700_000_000_001,
        ms: 4,
      },
    ]);

    const lastResults = getLastResults();
    expect(lastResults.proxied['europe-west4']['asia-southeast1'].dns).toBe(4);
  });

  it('writeErrors forwards the batch to the ClickHouse error writer', async () => {
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

    expect(writeErrorRows).toHaveBeenCalledTimes(1);
    expect(writeErrorRows).toHaveBeenCalledWith('europe-west4', errors);
  });
});
