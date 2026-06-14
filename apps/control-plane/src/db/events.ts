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
