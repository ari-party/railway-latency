import type { ClickHouseClient } from '@clickhouse/client';

export interface FleetMetricsRequest {
  network: string;
  rangeStartMs: number;
  rangeEndMs: number;
  windowMs: number;
}

export interface FleetMetricsRow {
  bucketMs: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  total: number;
  errors: number;
  failures: number;
}

export function buildFleetMetricsSql(request: FleetMetricsRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  const sql =
    'SELECT intDiv(toUnixTimestamp64Milli(time), {windowMs:Int64}) * {windowMs:Int64} + {windowMs:Int64} AS bucketMs, ' +
    'round(quantile(0.5)(http_ms), 3) AS p50, ' +
    'round(quantile(0.95)(http_ms), 3) AS p95, ' +
    'round(quantile(0.99)(http_ms), 3) AS p99, ' +
    'count() AS total, ' +
    'countIf(http_status >= 400) AS errors, ' +
    "countIf(fail_stage != '') AS failures " +
    'FROM check_events ' +
    'WHERE network = {network:String} ' +
    'AND time >= fromUnixTimestamp64Milli({rangeStartMs:Int64}) ' +
    'AND time < fromUnixTimestamp64Milli({rangeEndMs:Int64}) ' +
    'GROUP BY bucketMs ' +
    'ORDER BY bucketMs';

  return {
    sql,
    params: {
      network: request.network,
      rangeStartMs: request.rangeStartMs,
      rangeEndMs: request.rangeEndMs,
      windowMs: request.windowMs,
    },
  };
}

export async function queryFleetMetrics(
  client: ClickHouseClient,
  request: FleetMetricsRequest,
): Promise<FleetMetricsRow[]> {
  const { sql, params } = buildFleetMetricsSql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  return (await result.json()) as FleetMetricsRow[];
}
