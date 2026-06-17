import type { ClickHouseClient } from '@clickhouse/client';
import type {
  CheckEventListRow,
  CheckEventDetailRow,
} from '@railway-latency/types';

export type { CheckEventListRow, CheckEventDetailRow };

export interface CheckQueryFilters {
  status?: { op: 'eq' | 'gte' | 'lte' | 'gt' | 'lt'; value: number };
  failStage?: 'dns' | 'handshake' | 'http';
  network?: 'private' | 'public' | 'proxied';
  src?: string;
  dst?: string;
  edge?: string;
  cf?: string;
  hikari?: string;
  hasBody?: boolean;
  text?: string;
}

export interface CheckEventCursor {
  time: number;
  src: string;
  dst: string;
  network: string;
}

export interface CheckQueryRequest {
  filters: CheckQueryFilters;
  from?: number;
  to?: number;
  cursor?: CheckEventCursor;
  limit: number;
}

const STATUS_OPERATOR_SQL = {
  eq: '=',
  gte: '>=',
  lte: '<=',
  gt: '>',
  lt: '<',
} as const;

const LIST_COLUMNS =
  'toUnixTimestamp64Milli(time) AS time, src, dst, network, fail_stage, reason, ' +
  'dns_ms, handshake_ms, http_ms, http_status, railway_edge, cf_pop, hikari_pop, request_id, body_truncated';

export function buildCheckQuerySql(request: CheckQueryRequest): {
  sql: string;
  params: Record<string, unknown>;
} {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  const { filters } = request;

  if (filters.network) {
    clauses.push('network = {network:String}');
    params.network = filters.network;
  }
  if (filters.src) {
    clauses.push('src = {src:String}');
    params.src = filters.src;
  }
  if (filters.dst) {
    clauses.push('dst = {dst:String}');
    params.dst = filters.dst;
  }
  if (filters.edge) {
    clauses.push('railway_edge = {edge:String}');
    params.edge = filters.edge;
  }
  if (filters.cf) {
    clauses.push('cf_pop = {cf:String}');
    params.cf = filters.cf;
  }
  if (filters.hikari) {
    clauses.push('hikari_pop = {hikari:String}');
    params.hikari = filters.hikari;
  }
  if (filters.failStage) {
    clauses.push('fail_stage = {failStage:String}');
    params.failStage = filters.failStage;
  }
  if (filters.status) {
    clauses.push(
      `http_status ${STATUS_OPERATOR_SQL[filters.status.op]} {status:UInt16}`,
    );
    params.status = filters.status.value;
  }
  if (filters.hasBody) clauses.push("body != ''");
  if (filters.text) {
    clauses.push(
      '(positionCaseInsensitive(reason, {text:String}) > 0 OR positionCaseInsensitive(body, {text:String}) > 0)',
    );
    params.text = filters.text;
  }
  // Qualify `time` to the column: the SELECT aliases `toUnixTimestamp64Milli(time) AS time`,
  // so an unqualified `time` here binds to that ms alias and breaks the DateTime64 compare.
  if (request.from != null) {
    clauses.push('check_events.time >= fromUnixTimestamp64Milli({from:Int64})');
    params.from = request.from;
  }
  if (request.to != null) {
    clauses.push('check_events.time <= fromUnixTimestamp64Milli({to:Int64})');
    params.to = request.to;
  }
  if (request.cursor != null) {
    clauses.push(
      '(check_events.time, src, dst, network) < (fromUnixTimestamp64Milli({cursorTime:Int64}), {cursorSrc:String}, {cursorDst:String}, {cursorNetwork:String})',
    );
    params.cursorTime = request.cursor.time;
    params.cursorSrc = request.cursor.src;
    params.cursorDst = request.cursor.dst;
    params.cursorNetwork = request.cursor.network;
  }

  const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
  params.limit = request.limit;
  const sql = `SELECT ${LIST_COLUMNS} FROM check_events ${where} ORDER BY check_events.time DESC, src DESC, dst DESC, network DESC LIMIT {limit:UInt32}`;
  return { sql, params };
}

export async function queryCheckEvents(
  client: ClickHouseClient,
  request: CheckQueryRequest,
): Promise<CheckEventListRow[]> {
  const { sql, params } = buildCheckQuerySql(request);
  const result = await client.query({
    query: sql,
    query_params: params,
    format: 'JSONEachRow',
  });
  return (await result.json()) as CheckEventListRow[];
}

export async function getCheckEventDetail(
  client: ClickHouseClient,
  key: { time: number; src: string; dst: string; network: string },
): Promise<CheckEventDetailRow | null> {
  const result = await client.query({
    query:
      'SELECT toUnixTimestamp64Milli(time) AS time, src, dst, network, fail_stage, reason, ' +
      'dns_ms, handshake_ms, http_ms, http_status, railway_edge, cf_pop, hikari_pop, request_id, ' +
      'body_truncated, headers, body FROM check_events ' +
      'WHERE check_events.time = fromUnixTimestamp64Milli({time:Int64}) AND src = {src:String} ' +
      'AND dst = {dst:String} AND network = {network:String} LIMIT 1',
    query_params: key,
    format: 'JSONEachRow',
  });
  const rows = (await result.json()) as CheckEventDetailRow[];
  return rows[0] ?? null;
}
