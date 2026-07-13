import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { runMigrations } from '@/db/migrate';
import {
  createProbe,
  disableProbe,
  enableProbe,
  getProbe,
  markActiveIfEnrolled,
  revokeProbeKey,
  setDeployedSha,
  setProbeApiKey,
} from '@/db/probes';

const NEW = {
  probeId: 'europe-ovh-fra1',
  lat: 50,
  lon: 8,
  host: '203.0.113.10',
};

describe('probes key lifecycle', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
    await createProbe(NEW);
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('sets the api key without changing status', async () => {
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_abcd1234',
    });

    const probe = await getProbe('europe-ovh-fra1');
    expect(probe?.apiKeyPrefix).toBe('rl_europe-ovh-fra1_abcd1234');
    expect(probe?.status).toBe('created');
  });

  it('markActiveIfEnrolled flips an enrolled probe to active', async () => {
    await testPool.query(
      `update probes set status = 'enrolled' where probe_id = 'europe-ovh-fra1'`,
    );
    await markActiveIfEnrolled('europe-ovh-fra1');
    expect((await getProbe('europe-ovh-fra1'))?.status).toBe('active');
  });

  it('markActiveIfEnrolled leaves disabled and revoked probes untouched', async () => {
    await disableProbe('europe-ovh-fra1');
    await markActiveIfEnrolled('europe-ovh-fra1');
    expect((await getProbe('europe-ovh-fra1'))?.status).toBe('disabled');

    await testPool.query(
      `update probes set status = 'revoked' where probe_id = 'europe-ovh-fra1'`,
    );
    await markActiveIfEnrolled('europe-ovh-fra1');
    expect((await getProbe('europe-ovh-fra1'))?.status).toBe('revoked');
  });

  it('rotation moves the old hash to prev_* with a future expiry', async () => {
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_old00000',
    });
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('bb', 'hex'),
      prefix: 'rl_europe-ovh-fra1_new00000',
      rotate: true,
    });

    const probe = await getProbe('europe-ovh-fra1');
    expect(probe?.apiKeyPrefix).toBe('rl_europe-ovh-fra1_new00000');
    expect(probe?.prevKeyPrefix).toBe('rl_europe-ovh-fra1_old00000');
    expect(probe?.prevApiKeyHash?.equals(Buffer.from('aa', 'hex'))).toBe(true);
    expect(new Date(probe!.prevKeyExpiresAt!).getTime()).toBeGreaterThan(
      Date.now(),
    );
  });

  it('revoke keeps the hash, clears prev_*, sets status revoked', async () => {
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_abcd1234',
    });
    await revokeProbeKey('europe-ovh-fra1');

    const probe = await getProbe('europe-ovh-fra1');
    expect(probe?.status).toBe('revoked');
    expect(probe?.apiKeyHash?.equals(Buffer.from('aa', 'hex'))).toBe(true);
    expect(probe?.prevKeyPrefix).toBeNull();
  });

  it('disable sets status disabled', async () => {
    await disableProbe('europe-ovh-fra1');
    expect((await getProbe('europe-ovh-fra1'))?.status).toBe('disabled');
  });

  it('enable restores the status the probe had reached', async () => {
    await disableProbe('europe-ovh-fra1');
    expect(await enableProbe('europe-ovh-fra1')).toBe('created');

    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_abcd1234',
    });
    await disableProbe('europe-ovh-fra1');
    expect(await enableProbe('europe-ovh-fra1')).toBe('enrolled');

    await testPool.query(
      `update probes set last_seen = now() where probe_id = 'europe-ovh-fra1'`,
    );
    await disableProbe('europe-ovh-fra1');
    expect(await enableProbe('europe-ovh-fra1')).toBe('active');
  });

  it('enable is a no-op for a probe that is not disabled', async () => {
    await revokeProbeKey('europe-ovh-fra1');

    expect(await enableProbe('europe-ovh-fra1')).toBeNull();
    expect((await getProbe('europe-ovh-fra1'))?.status).toBe('revoked');
  });

  it('stores the deployed sha', async () => {
    await setDeployedSha('europe-ovh-fra1', 'abc1234');

    const probe = await getProbe('europe-ovh-fra1');
    expect(probe?.deployedSha).toBe('abc1234');
  });
});
