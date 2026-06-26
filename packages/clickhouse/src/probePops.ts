import type { ClickHouseClient } from '@clickhouse/client';

export interface ProbeRecentPopsRequest {
  src: string;
  network: string;
  sinceMs: number;
}

export interface ProbePopRoute {
  dst: string;
  cfPop: string;
  hikariPop: string;
  hits: number;
  latencyMs: number | null;
}

export function buildProbeRecentPopsSql(request: ProbeRecentPopsRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  // toUInt32 keeps count() a JSON number; ClickHouse quotes bare 64-bit ints as
  // strings, which the consumer's numeric schema would reject.
  // cf_pop is '' for public traffic, so grouping by it only splits proxied routes.
  const sql =
    'SELECT dst, cf_pop AS cfPop, hikari_pop AS hikariPop, ' +
    'toUInt32(count()) AS hits, round(avgOrNull(http_ms)) AS latencyMs ' +
    'FROM check_events ' +
    'WHERE src = {src:String} AND network = {network:String} ' +
    'AND check_events.time >= fromUnixTimestamp64Milli({sinceMs:Int64}) ' +
    "AND hikari_pop != '' " +
    'GROUP BY dst, cf_pop, hikari_pop ' +
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
