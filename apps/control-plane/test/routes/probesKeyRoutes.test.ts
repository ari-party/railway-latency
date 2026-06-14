import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';

vi.mock('@/services/ansible', () => {
  const runPlaybook = vi.fn(async (_options: unknown) => true);
  return {
    runPlaybook,
    isRunning: vi.fn(() => false),
    fireConverge: vi.fn((options: unknown) => {
      void runPlaybook(options);
    }),
  };
});

import { internalTokenHeader } from '../helpers/internalToken';
import { runMigrations } from '@/db/migrate';
import { getProbe, setDeployedSha, setProbeApiKey } from '@/db/probes';
import { requireInternalToken } from '@/middleware/internalToken';
import probesRouter from '@/routes/probes';
import { runPlaybook } from '@/services/ansible';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/probes', requireInternalToken, probesRouter);
  return app;
}

const VALID = {
  probeId: 'europe-ovh-fra1',
  lat: 1,
  lon: 2,
  host: '203.0.113.10',
};

describe('probe key routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
    await request(buildApp())
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('rotate returns the plaintext key once and honors the old key', async () => {
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_old00000',
    });
    const response = await request(buildApp())
      .post('/probes/europe-ovh-fra1/key/rotate')
      .set(internalTokenHeader)
      .expect(200);
    expect(response.body.apiKey).toMatch(/^rl_europe-ovh-fra1_/);

    const probe = await getProbe('europe-ovh-fra1');
    expect(probe?.prevKeyPrefix).toBe('rl_europe-ovh-fra1_old00000');
  });

  it('rotate fires a converge at the deployed sha when the probe is deployed', async () => {
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_old00000',
    });
    await setDeployedSha('europe-ovh-fra1', 'abc1234');

    await request(buildApp())
      .post('/probes/europe-ovh-fra1/key/rotate')
      .set(internalTokenHeader)
      .expect(200);

    expect(runPlaybook).toHaveBeenCalledWith(
      expect.objectContaining({
        probeId: 'europe-ovh-fra1',
        playbook: 'converge',
        probeSha: 'abc1234',
      }),
    );
  });

  it('rotate does not fire a converge when the probe has no deployed sha', async () => {
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_old00000',
    });
    await request(buildApp())
      .post('/probes/europe-ovh-fra1/key/rotate')
      .set(internalTokenHeader)
      .expect(200);
    expect(runPlaybook).not.toHaveBeenCalled();
  });

  it('revoke sets status revoked and keeps the hash', async () => {
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_p0000000',
    });

    await request(buildApp())
      .post('/probes/europe-ovh-fra1/key/revoke')
      .set(internalTokenHeader)
      .expect(200);

    const probe = await getProbe('europe-ovh-fra1');
    expect(probe?.status).toBe('revoked');
    expect(probe?.apiKeyHash?.equals(Buffer.from('aa', 'hex'))).toBe(true);
  });

  it('disable sets status disabled', async () => {
    await request(buildApp())
      .post('/probes/europe-ovh-fra1/disable')
      .set(internalTokenHeader)
      .expect(200);
    expect((await getProbe('europe-ovh-fra1'))?.status).toBe('disabled');
  });
});
