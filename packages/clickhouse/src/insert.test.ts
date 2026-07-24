import { describe, expect, it, vi } from 'vitest';

import {
  insertCheckEvents,
  insertSamples,
  insertErrorEvents,
  insertMtrEvents,
} from '@/insert';

import type { ErrorEventRow } from '@/errorRows';
import type { MtrEventRow } from '@/mtrRows';
import type { CheckEventRow } from '@/rows';
import type { SampleRow } from '@/sampleRows';
import type { ClickHouseClient } from '@clickhouse/client';

const row: CheckEventRow = {
  time: '2023-11-14 22:13:20.000',
  src: 'probe-iad',
  dst: 'europe-west4',
  network: 'public',
  fail_stage: '',
  reason: '',
  dns_ms: 2,
  handshake_ms: 38,
  http_ms: 312,
  http_status: 200,
  railway_edge: 'iad',
  cf_pop: 'SIN',
  hikari_pop: '',
  request_id: 'req_9b2',
  headers: {},
  body: '',
  body_truncated: false,
};

describe('insertCheckEvents', () => {
  it('inserts rows as JSONEachRow with async_insert fire-and-forget settings', async () => {
    const insert = vi.fn(async () => undefined);
    const client = { insert } as unknown as ClickHouseClient;
    await insertCheckEvents(client, [row]);
    expect(insert).toHaveBeenCalledWith({
      table: 'check_events',
      values: [row],
      format: 'JSONEachRow',
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
        async_insert_use_adaptive_busy_timeout: 0,
        async_insert_busy_timeout_max_ms: 5000,
        async_insert_max_data_size: '10485760',
      },
    });
  });

  it('does nothing when there are no rows', async () => {
    const insert = vi.fn(async () => undefined);
    const client = { insert } as unknown as ClickHouseClient;
    await insertCheckEvents(client, []);
    expect(insert).not.toHaveBeenCalled();
  });
});

const sampleRow: SampleRow = {
  time: '2023-11-14 22:13:20.000',
  src: 'probe-ams',
  dst: 'europe-west4',
  measurement: 'httpPublic',
  origin: 'external',
  ms: 12.5,
  railway_edge: '',
  cf_pop: '',
  hikari_pop: '',
};

describe('insertSamples', () => {
  it('inserts sample rows fire-and-forget', async () => {
    const insert = vi.fn(async () => undefined);
    const client = { insert } as unknown as ClickHouseClient;
    await insertSamples(client, [sampleRow]);
    expect(insert).toHaveBeenCalledWith({
      table: 'samples',
      values: [sampleRow],
      format: 'JSONEachRow',
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 0,
        async_insert_use_adaptive_busy_timeout: 0,
        async_insert_busy_timeout_max_ms: 5000,
        async_insert_max_data_size: '10485760',
      },
    });
  });

  it('does nothing with no rows', async () => {
    const insert = vi.fn(async () => undefined);
    await insertSamples({ insert } as unknown as ClickHouseClient, []);
    expect(insert).not.toHaveBeenCalled();
  });
});

describe('insertErrorEvents', () => {
  it('inserts error rows into error_events', async () => {
    const insert = vi.fn(async () => undefined);
    const errorRow: ErrorEventRow = {
      time: '2023-11-14 22:13:20.000',
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      origin: 'external',
      reason: 'reset',
    };
    await insertErrorEvents({ insert } as unknown as ClickHouseClient, [
      errorRow,
    ]);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'error_events', values: [errorRow] }),
    );
  });
});

describe('insertMtrEvents', () => {
  it('inserts mtr rows into mtr_events', async () => {
    const insert = vi.fn(async () => undefined);
    const mtrRow: MtrEventRow = {
      time: '2023-11-14 22:13:20.000',
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      hops: '[]',
    };
    await insertMtrEvents({ insert } as unknown as ClickHouseClient, [mtrRow]);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ table: 'mtr_events', values: [mtrRow] }),
    );
  });
});
