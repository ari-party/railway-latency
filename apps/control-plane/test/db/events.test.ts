import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { recordEvent } from '@/db/events';
import { runMigrations } from '@/db/migrate';

describe('events db', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
    await testPool.query(
      `insert into probes (probe_id, lat, lon, host)
       values ('europe-ovh-fra1', 50.1, 8.6, '203.0.113.10')`,
    );
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('keeps events (with their probe_id) after the probe is deleted', async () => {
    await recordEvent('europe-ovh-fra1', 'deleted');
    await testPool.query(
      `delete from probes where probe_id = 'europe-ovh-fra1'`,
    );

    const survivors = await testPool.query<{
      kind: string;
      probe_id: string | null;
    }>(`select kind, probe_id from events where kind = 'deleted'`);
    expect(survivors.rows).toHaveLength(1);
    expect(survivors.rows[0].probe_id).toBe('europe-ovh-fra1');
  });

  it('records events with their detail payload', async () => {
    await recordEvent('europe-ovh-fra1', 'created');
    await recordEvent('europe-ovh-fra1', 'ansible_started', {
      probeSha: 'abc1234',
    });

    const events = await testPool.query<{
      kind: string;
      detail: Record<string, unknown>;
    }>(
      `select kind, detail from events
       where probe_id = 'europe-ovh-fra1' order by created_at desc, id desc`,
    );
    expect(events.rows.map((row) => row.kind)).toEqual([
      'ansible_started',
      'created',
    ]);
    expect(events.rows[0].detail).toEqual({ probeSha: 'abc1234' });
  });
});
