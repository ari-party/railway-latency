import type { ErrorEventRow } from '@/errorRows';
import type { MtrEventRow } from '@/mtrRows';
import type { CheckEventRow } from '@/rows';
import type { SampleRow } from '@/sampleRows';
import type { ClickHouseClient } from '@clickhouse/client';

export const CHECK_EVENTS_TABLE = 'check_events';
export const SAMPLES_TABLE = 'samples';
export const ERROR_EVENTS_TABLE = 'error_events';
export const MTR_EVENTS_TABLE = 'mtr_events';

// Probes drip a few rows per second per table, so left alone each insert lands
// as its own tiny part and ClickHouse burns CPU merging thousands of them back
// together. Hold rows server-side for a few seconds so they coalesce into ~one
// part per window. The adaptive timeout ignores the max unless it is disabled,
// so we pin it off and set the window explicitly. Set on the query rather than a
// server profile so it applies regardless of which user the app connects as.
const FIRE_AND_FORGET = {
  async_insert: 1,
  wait_for_async_insert: 0,
  async_insert_use_adaptive_busy_timeout: 0,
  async_insert_busy_timeout_max_ms: 5000,
  async_insert_max_data_size: '10485760',
} as const;

export async function insertCheckEvents(
  client: ClickHouseClient,
  rows: CheckEventRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: CHECK_EVENTS_TABLE,
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: FIRE_AND_FORGET,
  });
}

export async function insertSamples(
  client: ClickHouseClient,
  rows: SampleRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: SAMPLES_TABLE,
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: FIRE_AND_FORGET,
  });
}

export async function insertErrorEvents(
  client: ClickHouseClient,
  rows: ErrorEventRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: ERROR_EVENTS_TABLE,
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: FIRE_AND_FORGET,
  });
}

export async function insertMtrEvents(
  client: ClickHouseClient,
  rows: MtrEventRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: MTR_EVENTS_TABLE,
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: FIRE_AND_FORGET,
  });
}
