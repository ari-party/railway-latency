import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import {
  consumeEnrollmentToken,
  insertEnrollmentToken,
} from '@/db/enrollmentTokens';
import { runMigrations } from '@/db/migrate';
import { createProbe } from '@/db/probes';

const HASH = Buffer.from('a1', 'hex');

async function seedProbe() {
  await createProbe({
    probeId: 'europe-ovh-fra1',
    lat: 1,
    lon: 2,
    host: '203.0.113.10',
  });
}

describe('enrollment tokens db', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
    await seedProbe();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('consumes a valid token once and marks the probe enrolled', async () => {
    await insertEnrollmentToken(HASH, 'europe-ovh-fra1', 10);
    const first = await consumeEnrollmentToken(HASH);
    expect(first).toEqual({ outcome: 'ok', probeId: 'europe-ovh-fra1' });

    const probe = await testPool.query<{ status: string }>(
      `select status from probes where probe_id = 'europe-ovh-fra1'`,
    );
    expect(probe.rows[0].status).toBe('enrolled');
  });

  it('replay after a successful enroll reports already_enrolled (probe past enrollment)', async () => {
    await insertEnrollmentToken(HASH, 'europe-ovh-fra1', 10);
    await consumeEnrollmentToken(HASH);

    const replay = await consumeEnrollmentToken(HASH);
    expect(replay).toEqual({
      outcome: 'already_enrolled',
      probeId: 'europe-ovh-fra1',
    });
  });

  it('reports consumed for a used token whose probe is still pre-enrollment', async () => {
    await insertEnrollmentToken(HASH, 'europe-ovh-fra1', 10);
    await testPool.query(
      `update enrollment_tokens set used_at = now() where token_hash = $1`,
      [HASH],
    );

    const replay = await consumeEnrollmentToken(HASH);
    expect(replay.outcome).toBe('consumed');
  });

  it('does not re-enroll a probe disabled before call-home', async () => {
    await insertEnrollmentToken(HASH, 'europe-ovh-fra1', 10);
    await testPool.query(
      `update probes set status = 'disabled' where probe_id = 'europe-ovh-fra1'`,
    );

    await consumeEnrollmentToken(HASH);

    const probe = await testPool.query<{ status: string }>(
      `select status from probes where probe_id = 'europe-ovh-fra1'`,
    );
    expect(probe.rows[0].status).toBe('disabled');
  });

  it('rejects an expired token', async () => {
    await insertEnrollmentToken(HASH, 'europe-ovh-fra1', -1);
    const expired = await consumeEnrollmentToken(HASH);
    expect(expired.outcome).toBe('expired');
  });

  it('rejects an unknown token hash', async () => {
    const unknown = await consumeEnrollmentToken(Buffer.from('ff', 'hex'));
    expect(unknown.outcome).toBe('unknown');
  });
});
