import type { ErrorEventRow } from '@/errorRows';
import type { MtrEventRow } from '@/mtrRows';
import type { CheckEventRow } from '@/rows';
import type { SampleRow } from '@/sampleRows';
import type { ClickHouseClient } from '@clickhouse/client';

export const CHECK_EVENTS_TABLE = 'check_events';
export const SAMPLES_TABLE = 'samples';
export const ERROR_EVENTS_TABLE = 'error_events';
export const MTR_EVENTS_TABLE = 'mtr_events';

const FIRE_AND_FORGET = {
  async_insert: 1,
  wait_for_async_insert: 0,
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
