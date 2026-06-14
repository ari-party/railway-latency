import { pool, query } from '@/db/pool';

export async function insertEnrollmentToken(
  tokenHash: Buffer,
  probeId: string,
  ttlMinutes: number,
): Promise<void> {
  await query(
    `insert into enrollment_tokens (token_hash, probe_id, expires_at)
     values ($1, $2, now() + ($3 || ' minutes')::interval)`,
    [tokenHash, probeId, String(ttlMinutes)],
  );
}

export type ConsumeResult =
  | { outcome: 'ok'; probeId: string }
  | { outcome: 'unknown' }
  | { outcome: 'consumed' }
  | { outcome: 'expired' }
  | { outcome: 'already_enrolled'; probeId: string };

export async function consumeEnrollmentToken(
  tokenHash: Buffer,
): Promise<ConsumeResult> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const row = await client.query<{
      probe_id: string;
      used_at: string | null;
      expired: boolean;
      probe_status: string;
    }>(
      `select t.probe_id, t.used_at, now() > t.expires_at as expired, p.status as probe_status
       from enrollment_tokens t join probes p on p.probe_id = t.probe_id
       where t.token_hash = $1 for update of t`,
      [tokenHash],
    );

    if (row.rows.length === 0) {
      await client.query('rollback');
      return { outcome: 'unknown' };
    }
    const token = row.rows[0];
    if (['enrolled', 'active'].includes(token.probe_status)) {
      await client.query('rollback');
      return { outcome: 'already_enrolled', probeId: token.probe_id };
    }
    if (token.used_at !== null) {
      await client.query('rollback');
      return { outcome: 'consumed' };
    }
    if (token.expired) {
      await client.query('rollback');
      return { outcome: 'expired' };
    }

    await client.query(
      `update enrollment_tokens set used_at = now() where token_hash = $1`,
      [tokenHash],
    );
    await client.query(
      `update probes set status = 'enrolled', updated_at = now()
       where probe_id = $1 and status = 'created'`,
      [token.probe_id],
    );
    await client.query('commit');
    return { outcome: 'ok', probeId: token.probe_id };
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
