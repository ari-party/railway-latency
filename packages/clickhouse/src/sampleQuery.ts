import type { ClickHouseClient } from '@clickhouse/client';

export interface SampleAggregateRequest {
  src: string;
  dst: string;
  measurements: string[];
  rangeStartMs: number;
  rangeEndMs: number;
  windowMs: number;
}

export interface SampleAggregateRow {
  measurement: string;
  bucketMs: number;
  value: number;
}

export function buildSampleAggregateSql(request: SampleAggregateRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  const sql =
    'SELECT measurement, ' +
    'intDiv(toUnixTimestamp64Milli(time), {windowMs:Int64}) * {windowMs:Int64} + {windowMs:Int64} AS bucketMs, ' +
    'round(avg(ms), 5) AS value ' +
    'FROM samples ' +
    'WHERE src = {src:String} AND dst = {dst:String} ' +
    'AND measurement IN {measurements:Array(String)} ' +
    'AND time >= fromUnixTimestamp64Milli({rangeStartMs:Int64}) ' +
    'AND time < fromUnixTimestamp64Milli({rangeEndMs:Int64}) ' +
    'GROUP BY measurement, bucketMs ' +
    'ORDER BY bucketMs';

  return {
    sql,
    params: {
      src: request.src,
      dst: request.dst,
      measurements: request.measurements,
      rangeStartMs: request.rangeStartMs,
      rangeEndMs: request.rangeEndMs,
      windowMs: request.windowMs,
    },
  };
}

export async function querySampleAggregates(
  client: ClickHouseClient,
  request: SampleAggregateRequest,
): Promise<SampleAggregateRow[]> {
  const { sql, params } = buildSampleAggregateSql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  return (await result.json()) as SampleAggregateRow[];
}
