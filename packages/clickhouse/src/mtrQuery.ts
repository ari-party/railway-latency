import type { ClickHouseClient } from '@clickhouse/client';

export interface LatestMtrRequest {
  src: string;
  dst: string;
  network: string;
  sinceMs: number;
}

export interface LatestMtrRow {
  timeMs: number;
  hops: string;
}

export function buildLatestMtrSql(request: LatestMtrRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  const sql =
    'SELECT toUnixTimestamp64Milli(time) AS timeMs, hops ' +
    'FROM mtr_events ' +
    'WHERE src = {src:String} AND dst = {dst:String} AND network = {network:String} ' +
    'AND time >= fromUnixTimestamp64Milli({sinceMs:Int64}) ' +
    'ORDER BY time DESC LIMIT 1';

  return {
    sql,
    params: {
      src: request.src,
      dst: request.dst,
      network: request.network,
      sinceMs: request.sinceMs,
    },
  };
}

export async function queryLatestMtr(
  client: ClickHouseClient,
  request: LatestMtrRequest,
): Promise<LatestMtrRow | null> {
  const { sql, params } = buildLatestMtrSql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  const rows = (await result.json()) as LatestMtrRow[];
  return rows[0] ?? null;
}
