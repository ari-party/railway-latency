import type { CheckEventRow } from '@/rows';
import type { ClickHouseClient } from '@clickhouse/client';

export const CHECK_EVENTS_TABLE = 'check_events';

export async function insertCheckEvents(
  client: ClickHouseClient,
  rows: CheckEventRow[],
): Promise<void> {
  if (rows.length === 0) return;
  await client.insert({
    table: CHECK_EVENTS_TABLE,
    values: rows,
    format: 'JSONEachRow',
    clickhouse_settings: { async_insert: 1, wait_for_async_insert: 0 },
  });
}
