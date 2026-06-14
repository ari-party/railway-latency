import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { runMigrations } from '@/db/migrate';
import { createProbe, getProbe, listProbes, patchProbe } from '@/db/probes';

const NEW = {
  probeId: 'europe-ovh-fra1',
  lat: 50.1,
  lon: 8.6,
  host: '203.0.113.10',
};

describe('probes db', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('creates a probe with status created and no key', async () => {
    const probe = await createProbe(NEW);
    expect(probe.status).toBe('created');
    expect(probe.apiKeyPrefix).toBeNull();

    const fetched = await getProbe('europe-ovh-fra1');
    expect(fetched?.lat).toBe(50.1);
  });

  it('lists probes', async () => {
    await createProbe(NEW);
    const list = await listProbes();
    expect(list).toHaveLength(1);
    expect(list[0].probeId).toBe('europe-ovh-fra1');
  });

  it('patches mutable columns but never probe_id', async () => {
    await createProbe(NEW);

    const patched = await patchProbe('europe-ovh-fra1', {
      lat: 51,
      host: '198.51.100.7',
    });
    expect(patched?.lat).toBe(51);
    expect(patched?.lon).toBe(8.6);
    expect(patched?.host).toBe('198.51.100.7');
    expect(patched?.probeId).toBe('europe-ovh-fra1');
  });

  it('returns null patching an unknown probe', async () => {
    expect(await patchProbe('nope', { lat: 1 })).toBeNull();
  });
});
