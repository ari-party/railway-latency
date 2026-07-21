import type { ClickHouseClient } from '@clickhouse/client';

export interface RailwayPopsRequest {
  sinceMs: number;
}

export interface RailwayPopRow {
  pop: string;
  hits: number;
}

export function buildRailwayPopsSql(request: RailwayPopsRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  // toUInt32 keeps count() a JSON number; ClickHouse quotes bare 64-bit ints as
  // strings, which the consumer's numeric schema would reject.
  const sql =
    'SELECT hikari_pop AS pop, toUInt32(count()) AS hits ' +
    'FROM check_events ' +
    "WHERE network = 'public' AND hikari_pop != '' " +
    'AND check_events.time >= fromUnixTimestamp64Milli({sinceMs:Int64}) ' +
    'GROUP BY hikari_pop ' +
    'ORDER BY hits DESC';

  return { sql, params: { sinceMs: request.sinceMs } };
}

export async function queryRailwayPops(
  client: ClickHouseClient,
  request: RailwayPopsRequest,
): Promise<RailwayPopRow[]> {
  const { sql, params } = buildRailwayPopsSql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  return (await result.json()) as RailwayPopRow[];
}

export interface PopProbeLatencyRequest {
  pop: string;
  dst: string | null;
  rangeStartMs: number;
  rangeEndMs: number;
  windowMs: number;
}

export interface PopProbeLatencyRow {
  series: string;
  bucketMs: number;
  p95: number | null;
}

export function buildPopProbeLatencySql(request: PopProbeLatencyRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  // Across all regions each target region is a series; drilling into one region
  // breaks that region down by probe instead.
  const byRegion = request.dst == null;
  const dimension = byRegion ? 'dst' : 'src';
  const dstClause = byRegion ? [] : ['AND dst = {dst:String}'];

  const sql = [
    `SELECT ${dimension} AS series,`,
    'intDiv(toUnixTimestamp64Milli(time), {windowMs:Int64}) * {windowMs:Int64} + {windowMs:Int64} AS bucketMs,',
    'round(quantile(0.95)(http_ms), 3) AS p95',
    'FROM check_events',
    "WHERE network = 'public'",
    'AND hikari_pop = {pop:String}',
    ...dstClause,
    'AND check_events.time >= fromUnixTimestamp64Milli({rangeStartMs:Int64})',
    'AND check_events.time < fromUnixTimestamp64Milli({rangeEndMs:Int64})',
    'GROUP BY series, bucketMs',
    'ORDER BY series, bucketMs',
  ].join(' ');

  const params: Record<string, unknown> = {
    pop: request.pop,
    rangeStartMs: request.rangeStartMs,
    rangeEndMs: request.rangeEndMs,
    windowMs: request.windowMs,
  };
  if (request.dst != null) params.dst = request.dst;

  return { sql, params };
}

export async function queryPopProbeLatency(
  client: ClickHouseClient,
  request: PopProbeLatencyRequest,
): Promise<PopProbeLatencyRow[]> {
  const { sql, params } = buildPopProbeLatencySql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  return (await result.json()) as PopProbeLatencyRow[];
}

export interface PopProbeVolumeRequest {
  pop: string;
  dst: string | null;
  rangeStartMs: number;
  rangeEndMs: number;
  windowMs: number;
}

export interface PopProbeVolumeRow {
  series: string;
  bucketMs: number;
  count: number;
}

export function buildPopProbeVolumeSql(request: PopProbeVolumeRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  const dstClause = request.dst == null ? [] : ['AND dst = {dst:String}'];

  const sql = [
    'SELECT src AS series,',
    'intDiv(toUnixTimestamp64Milli(time), {windowMs:Int64}) * {windowMs:Int64} + {windowMs:Int64} AS bucketMs,',
    'toUInt32(count()) AS count',
    'FROM check_events',
    "WHERE network = 'public'",
    'AND hikari_pop = {pop:String}',
    ...dstClause,
    'AND check_events.time >= fromUnixTimestamp64Milli({rangeStartMs:Int64})',
    'AND check_events.time < fromUnixTimestamp64Milli({rangeEndMs:Int64})',
    'GROUP BY series, bucketMs',
    'ORDER BY series, bucketMs',
  ].join(' ');

  const params: Record<string, unknown> = {
    pop: request.pop,
    rangeStartMs: request.rangeStartMs,
    rangeEndMs: request.rangeEndMs,
    windowMs: request.windowMs,
  };
  if (request.dst != null) params.dst = request.dst;

  return { sql, params };
}

export async function queryPopProbeVolume(
  client: ClickHouseClient,
  request: PopProbeVolumeRequest,
): Promise<PopProbeVolumeRow[]> {
  const { sql, params } = buildPopProbeVolumeSql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
    clickhouse_settings: { output_format_json_quote_64bit_integers: 0 },
  });
  return (await result.json()) as PopProbeVolumeRow[];
}
