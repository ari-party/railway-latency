import type { ClickHouseClient } from '@clickhouse/client';

export interface ErrorAggregateRequest {
  src: string;
  dst: string;
  network: string;
  rangeStartMs: number;
  rangeEndMs: number;
  windowMs: number;
}

export interface ErrorAggregateRow {
  bucketMs: number;
  reason: string;
}

export function buildErrorAggregateSql(request: ErrorAggregateRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  const sql =
    'SELECT intDiv(toUnixTimestamp64Milli(time), {windowMs:Int64}) * {windowMs:Int64} + {windowMs:Int64} AS bucketMs, ' +
    'argMax(reason, time) AS reason ' +
    'FROM error_events ' +
    'WHERE src = {src:String} AND dst = {dst:String} AND network = {network:String} ' +
    'AND time >= fromUnixTimestamp64Milli({rangeStartMs:Int64}) ' +
    'AND time < fromUnixTimestamp64Milli({rangeEndMs:Int64}) ' +
    'GROUP BY bucketMs ' +
    'ORDER BY bucketMs';

  return {
    sql,
    params: {
      src: request.src,
      dst: request.dst,
      network: request.network,
      rangeStartMs: request.rangeStartMs,
      rangeEndMs: request.rangeEndMs,
      windowMs: request.windowMs,
    },
  };
}

export async function queryErrorAggregates(
  client: ClickHouseClient,
  request: ErrorAggregateRequest,
): Promise<ErrorAggregateRow[]> {
  const { sql, params } = buildErrorAggregateSql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  return (await result.json()) as ErrorAggregateRow[];
}
