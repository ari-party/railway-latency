import { describe, expect, it, vi } from 'vitest';

import { insertCheckEvents } from '@/insert';

import type { CheckEventRow } from '@/rows';
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
      clickhouse_settings: { async_insert: 1, wait_for_async_insert: 0 },
    });
  });

  it('does nothing when there are no rows', async () => {
    const insert = vi.fn(async () => undefined);
    const client = { insert } as unknown as ClickHouseClient;
    await insertCheckEvents(client, []);
    expect(insert).not.toHaveBeenCalled();
  });
});
