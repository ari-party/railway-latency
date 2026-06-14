import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';

vi.mock('@/services/releases', () => ({
  latestReleaseSha: vi.fn(async () => 'def5678'),
  releaseTagExists: vi.fn(async (sha: string) => sha === 'abc1234'),
}));
vi.mock('@/services/ansible', () => {
  const runPlaybook = vi.fn(async (_options: unknown) => undefined);
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
import { requireInternalToken } from '@/middleware/internalToken';
import probesRouter from '@/routes/probes';
import releasesRouter from '@/routes/releases';
import { runPlaybook } from '@/services/ansible';
import { releaseTagExists } from '@/services/releases';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/probes', requireInternalToken, probesRouter);
  app.use('/releases', requireInternalToken, releasesRouter);
  return app;
}

const VALID = {
  probeId: 'europe-ovh-fra1',
  lat: 1,
  lon: 2,
  host: '203.0.113.10',
};

describe('probe update + releases routes', () => {
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

  it('rejects an update for a nonexistent release tag (422)', async () => {
    await request(buildApp())
      .post('/probes/europe-ovh-fra1/update')
      .set(internalTokenHeader)
      .send({ sha: 'ffffff0' })
      .expect(422);

    expect(runPlaybook).not.toHaveBeenCalled();
  });

  it('answers 503 (not 422) when the release tag check is unavailable', async () => {
    vi.mocked(releaseTagExists).mockRejectedValueOnce(
      new Error('rate limited'),
    );

    await request(buildApp())
      .post('/probes/europe-ovh-fra1/update')
      .set(internalTokenHeader)
      .send({ sha: 'abc1234' })
      .expect(503);

    expect(runPlaybook).not.toHaveBeenCalled();
  });

  it('rejects a malformed sha (400)', async () => {
    await request(buildApp())
      .post('/probes/europe-ovh-fra1/update')
      .set(internalTokenHeader)
      .send({ sha: 'NOTHEX' })
      .expect(400);
  });

  it('runs a converge with the pinned sha for a valid release', async () => {
    await request(buildApp())
      .post('/probes/europe-ovh-fra1/update')
      .set(internalTokenHeader)
      .send({ sha: 'abc1234' })
      .expect(202);

    expect(runPlaybook).toHaveBeenCalledWith(
      expect.objectContaining({
        probeId: 'europe-ovh-fra1',
        playbook: 'converge',
        probeSha: 'abc1234',
      }),
    );
  });

  it('update-all fans out across enrolled/active probes', async () => {
    await testPool.query(
      `update probes set status = 'active' where probe_id = 'europe-ovh-fra1'`,
    );

    await request(buildApp())
      .post('/probes/update-all')
      .set(internalTokenHeader)
      .send({ sha: 'abc1234' })
      .expect(202);

    expect(runPlaybook).toHaveBeenCalledTimes(1);
  });
});
