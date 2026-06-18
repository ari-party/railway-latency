import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { runMigrations } from '@/db/migrate';
import {
  advanceLastSeen,
  createProbe,
  getMapRoster,
  getRoster,
  revokeProbeKey,
  setProbeApiKey,
} from '@/db/probes';

async function seed(probeId: string) {
  await createProbe({ probeId, lat: 1, lon: 2, host: '203.0.113.10' });
}

async function key(probeId: string, hash: string, prefix: string) {
  await setProbeApiKey(probeId, { hash: Buffer.from(hash, 'hex'), prefix });
  await testPool.query(
    `update probes set status = 'active' where probe_id = $1`,
    [probeId],
  );
}

describe('roster projections', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('roster excludes created probes but includes revoked ones with the hash kept', async () => {
    await seed('a-keyed-1');
    await key('a-keyed-1', 'aa', 'rl_a-keyed-1_p0000000');
    await seed('b-created-1');
    await seed('c-revoked-1');
    await key('c-revoked-1', 'cc', 'rl_c-revoked-1_p0000000');
    await revokeProbeKey('c-revoked-1');

    const roster = await getRoster();
    const ids = roster.map((entry) => entry.probeId).sort();
    expect(ids).toEqual(['a-keyed-1', 'c-revoked-1']);
    const revoked = roster.find((entry) => entry.probeId === 'c-revoked-1')!;
    expect(revoked.status).toBe('revoked');
    expect(revoked.apiKeyHash).toBe('cc');
  });

  it('roster omits prev_* once the expiry is in the past', async () => {
    await seed('d-rotated-1');
    await key('d-rotated-1', '11', 'rl_d-rotated-1_old00000');
    await setProbeApiKey('d-rotated-1', {
      hash: Buffer.from('22', 'hex'),
      prefix: 'rl_d-rotated-1_new00000',
      rotate: true,
    });
    let entry = (await getRoster()).find((e) => e.probeId === 'd-rotated-1')!;
    expect(entry.previousApiKeyPrefix).toBe('rl_d-rotated-1_old00000');

    await testPool.query(
      `update probes set prev_key_expires_at = now() - interval '1 minute' where probe_id = 'd-rotated-1'`,
    );
    entry = (await getRoster()).find((e) => e.probeId === 'd-rotated-1')!;
    expect(entry.previousApiKeyPrefix).toBeUndefined();
    expect(entry.previousApiKeyHash).toBeUndefined();
  });

  it('map-roster is secrets-free', async () => {
    await seed('e-map-1');
    await key('e-map-1', 'ee', 'rl_e-map-1_p0000000');

    const map = await getMapRoster();
    const entry = map.find((e) => e.probeId === 'e-map-1')!;
    expect(entry).toEqual({
      probeId: 'e-map-1',
      lat: 1,
      lon: 2,
      status: 'down',
      asn: null,
    });
    expect(Object.keys(entry)).not.toContain('apiKeyHash');
    expect(Object.keys(entry)).not.toContain('lastSeen');
  });

  it('advanceLastSeen bumps last_seen to the server time', async () => {
    await seed('f-seen-1');
    await key('f-seen-1', 'ff', 'rl_f-seen-1_p0000000');

    const when = new Date();
    await advanceLastSeen([{ probeId: 'f-seen-1', ts: when.getTime() }]);

    const map = await getMapRoster();
    const entry = map.find((e) => e.probeId === 'f-seen-1')!;
    expect(entry.status).toBe('green');
  });
});
