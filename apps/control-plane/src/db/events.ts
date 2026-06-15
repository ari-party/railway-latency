import { query } from '@/db/pool';

export async function recordEvent(
  probeId: string | null,
  kind: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await query(
    'insert into events (probe_id, kind, detail) values ($1, $2, $3)',
    [probeId, kind, JSON.stringify(detail)],
  );
}

export interface EventRow {
  id: number;
  kind: string;
  detail: Record<string, unknown>;
  createdAt: string;
}

export async function listEvents(
  probeId: string,
  limit: number,
): Promise<EventRow[]> {
  const result = await query<{
    id: string;
    kind: string;
    detail: Record<string, unknown>;
    created_at: string;
  }>(
    `select id, kind, detail, created_at from events
     where probe_id = $1 order by created_at desc, id desc limit $2`,
    [probeId, limit],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    kind: row.kind,
    detail: row.detail,
    createdAt: row.created_at,
  }));
}

export type ConvergeOutcomeResult = 'ok' | 'failed';

export interface ConvergeOutcome {
  probeId: string;
  result: ConvergeOutcomeResult;
  at: string;
}

const CONVERGE_TERMINAL_KINDS = [
  'ansible_ok',
  'ansible_failed',
  'converge_failed',
];

function convergeOutcomeResult(kind: string): ConvergeOutcomeResult {
  return kind === 'ansible_ok' ? 'ok' : 'failed';
}

export async function listConvergeOutcomes(): Promise<ConvergeOutcome[]> {
  const result = await query<{
    probe_id: string;
    kind: string;
    created_at: string;
  }>(
    `select distinct on (probe_id) probe_id, kind, created_at
       from events
      where probe_id is not null and kind = any($1::text[])
      order by probe_id, created_at desc, id desc`,
    [CONVERGE_TERMINAL_KINDS],
  );
  return result.rows.map((row) => ({
    probeId: row.probe_id,
    result: convergeOutcomeResult(row.kind),
    at: row.created_at,
  }));
}

export async function getConvergeOutcome(
  probeId: string,
): Promise<ConvergeOutcome | null> {
  const result = await query<{ kind: string; created_at: string }>(
    `select kind, created_at from events
      where probe_id = $1 and kind = any($2::text[])
      order by created_at desc, id desc limit 1`,
    [probeId, CONVERGE_TERMINAL_KINDS],
  );
  const row = result.rows[0];
  return row
    ? { probeId, result: convergeOutcomeResult(row.kind), at: row.created_at }
    : null;
}
