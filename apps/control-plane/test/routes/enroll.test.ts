import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';

vi.mock('@/services/automationKey', () => ({
  getAutomationPublicKey: async () => 'ssh-ed25519 AAAAtest automation',
}));
vi.mock('@/services/ansible', () => ({
  runPlaybook: vi.fn(async () => true),
}));
vi.mock('@/services/releases', () => ({
  latestReleaseSha: vi.fn(async () => 'abc1234'),
}));

import { insertEnrollmentToken } from '@/db/enrollmentTokens';
import { runMigrations } from '@/db/migrate';
import { createProbe, getProbe } from '@/db/probes';
import enrollRouter from '@/routes/enroll';
import { runPlaybook } from '@/services/ansible';
import { sha256 } from '@/services/apikey';
import { latestReleaseSha } from '@/services/releases';
import { secretStash } from '@/services/secretStash';

function flushMicrotasks() {
  return new Promise((resolve) => {
    setImmediate(resolve);
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/enroll', enrollRouter);
  return app;
}

async function seedToken(token: string) {
  await createProbe({
    probeId: 'europe-ovh-fra1',
    lat: 1,
    lon: 2,
    host: '203.0.113.10',
  });
  await insertEnrollmentToken(sha256(token), 'europe-ovh-fra1', 10);
}

describe('enroll routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
    vi.clearAllMocks();
    vi.mocked(runPlaybook).mockResolvedValue(true);
    vi.mocked(latestReleaseSha).mockResolvedValue('abc1234');
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('serves a token-gated bootstrap script', async () => {
    await seedToken('et_valid');

    const response = await request(buildApp())
      .get('/enroll/et_valid/bootstrap.sh')
      .expect(200);
    expect(response.headers['content-type']).toContain('text/x-shellscript');
    expect(response.text).toContain('#!/usr/bin/env bash');
    expect(response.text).toContain('ssh-ed25519 AAAAtest automation');
  });

  it('404s an unknown/consumed token for the script', async () => {
    await request(buildApp()).get('/enroll/et_nope/bootstrap.sh').expect(404);
  });

  it('callhome marks the probe enrolled', async () => {
    await seedToken('et_valid');
    await request(buildApp())
      .post('/enroll/callhome')
      .set('Authorization', 'Bearer et_valid')
      .send({})
      .expect(200);

    const probe = await testPool.query<{ status: string }>(
      `select status from probes where probe_id = 'europe-ovh-fra1'`,
    );
    expect(probe.rows[0].status).toBe('enrolled');
  });

  it('callhome mints+persists a key, stashes the plaintext, and fires a converge at the latest sha', async () => {
    await seedToken('et_valid');
    await request(buildApp())
      .post('/enroll/callhome')
      .set('Authorization', 'Bearer et_valid')
      .send({})
      .expect(200);

    const persisted = await getProbe('europe-ovh-fra1');
    expect(persisted?.apiKeyHash).not.toBeNull();
    expect(persisted?.apiKeyPrefix).toMatch(/^rl_europe-ovh-fra1_/);

    const stashed = secretStash.get('europe-ovh-fra1');
    expect(stashed?.apiKey).toMatch(/^rl_europe-ovh-fra1_/);

    await flushMicrotasks();
    expect(runPlaybook).toHaveBeenCalledWith(
      expect.objectContaining({
        probeId: 'europe-ovh-fra1',
        playbook: 'converge',
        probeSha: 'abc1234',
      }),
    );
  });

  it('callhome still enrolls (no converge) when no probe release exists yet', async () => {
    vi.mocked(latestReleaseSha).mockRejectedValue(new Error('no release'));
    await seedToken('et_valid');
    await request(buildApp())
      .post('/enroll/callhome')
      .set('Authorization', 'Bearer et_valid')
      .send({})
      .expect(200);

    await flushMicrotasks();
    expect(runPlaybook).not.toHaveBeenCalled();
    expect((await getProbe('europe-ovh-fra1'))?.status).toBe('enrolled');

    const deferred = await testPool.query(
      `select kind from events where probe_id = 'europe-ovh-fra1' and kind = 'enroll_deferred'`,
    );
    expect(deferred.rows).toHaveLength(1);
  });

  it('replayed callhome on an already-enrolled probe returns 409', async () => {
    await seedToken('et_valid');
    const app = buildApp();

    await request(app)
      .post('/enroll/callhome')
      .set('Authorization', 'Bearer et_valid')
      .send({})
      .expect(200);
    await request(app)
      .post('/enroll/callhome')
      .set('Authorization', 'Bearer et_valid')
      .send({})
      .expect(409);
  });

  it('a consumed token whose probe is still pre-enrollment returns 410', async () => {
    await seedToken('et_valid');
    await testPool.query(
      `update enrollment_tokens set used_at = now() where token_hash = $1`,
      [sha256('et_valid')],
    );

    await request(buildApp())
      .post('/enroll/callhome')
      .set('Authorization', 'Bearer et_valid')
      .send({})
      .expect(410);
  });

  it('unknown token returns 401', async () => {
    await request(buildApp())
      .post('/enroll/callhome')
      .set('Authorization', 'Bearer et_unknown')
      .send({})
      .expect(401);
  });
});
