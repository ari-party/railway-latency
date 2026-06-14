import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';

vi.mock('@/services/ansible', () => ({
  runPlaybook: vi.fn(async () => true),
  isRunning: vi.fn(() => false),
}));

import { internalTokenHeader } from '../helpers/internalToken';
import { runMigrations } from '@/db/migrate';
import { getProbe } from '@/db/probes';
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

describe('DELETE /probes/:id', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
    await request(buildApp())
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);
    vi.clearAllMocks();
    vi.mocked(runPlaybook).mockResolvedValue(true);
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('runs teardown FIRST, then removes the row on success', async () => {
    await request(buildApp())
      .delete('/probes/europe-ovh-fra1')
      .set(internalTokenHeader)
      .expect(204);

    expect(runPlaybook).toHaveBeenCalledWith(
      expect.objectContaining({
        probeId: 'europe-ovh-fra1',
        playbook: 'teardown',
      }),
    );
    expect(await getProbe('europe-ovh-fra1')).toBeNull();
  });

  it('404s an unknown probe', async () => {
    await request(buildApp())
      .delete('/probes/does-not-exist')
      .set(internalTokenHeader)
      .expect(404);
    expect(runPlaybook).not.toHaveBeenCalled();
  });

  it('FAILS the delete (502) and KEEPS the row when teardown cannot reach the host', async () => {
    vi.mocked(runPlaybook).mockResolvedValue(false);
    await request(buildApp())
      .delete('/probes/europe-ovh-fra1')
      .set(internalTokenHeader)
      .expect(502);
    expect(await getProbe('europe-ovh-fra1')).not.toBeNull();
  });

  it('force-delete skips teardown and drops the row with a force_deleted event', async () => {
    vi.mocked(runPlaybook).mockResolvedValue(false);

    await request(buildApp())
      .delete('/probes/europe-ovh-fra1?force=true')
      .set(internalTokenHeader)
      .expect(204);

    expect(runPlaybook).not.toHaveBeenCalled();
    expect(await getProbe('europe-ovh-fra1')).toBeNull();

    const forced = await testPool.query(
      `select kind, detail from events where kind = 'force_deleted'`,
    );
    expect(forced.rows).toHaveLength(1);
    expect(forced.rows[0].detail).toMatchObject({ probeId: 'europe-ovh-fra1' });
  });
});
