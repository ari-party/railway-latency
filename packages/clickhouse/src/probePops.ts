import type { ClickHouseClient } from '@clickhouse/client';

export interface ProbeRecentPopsRequest {
  src: string;
  network: string;
  sinceMs: number;
}

export interface ProbePopRoute {
  dst: string;
  hikariPop: string;
  hits: number;
}

export function buildProbeRecentPopsSql(request: ProbeRecentPopsRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  // toUInt32 keeps count() a JSON number; ClickHouse quotes bare 64-bit ints as
  // strings, which the consumer's numeric schema would reject.
  const sql =
    'SELECT dst, hikari_pop AS hikariPop, toUInt32(count()) AS hits ' +
    'FROM check_events ' +
    'WHERE src = {src:String} AND network = {network:String} ' +
    'AND check_events.time >= fromUnixTimestamp64Milli({sinceMs:Int64}) ' +
    "AND hikari_pop != '' " +
    'GROUP BY dst, hikari_pop ' +
    'ORDER BY hits DESC';

  return {
    sql,
    params: {
      src: request.src,
      network: request.network,
      sinceMs: request.sinceMs,
    },
  };
}

export async function queryProbeRecentPops(
  client: ClickHouseClient,
  request: ProbeRecentPopsRequest,
): Promise<ProbePopRoute[]> {
  const { sql, params } = buildProbeRecentPopsSql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  return (await result.json()) as ProbePopRoute[];
}
