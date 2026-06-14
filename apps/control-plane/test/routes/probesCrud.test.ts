import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { internalTokenHeader } from '../helpers/internalToken';
import { runMigrations } from '@/db/migrate';
import { requireInternalToken } from '@/middleware/internalToken';
import probesRouter from '@/routes/probes';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/probes', requireInternalToken, probesRouter);
  return app;
}

const VALID = {
  probeId: 'europe-ovh-fra1',
  lat: 50.1,
  lon: 8.6,
  host: '203.0.113.10',
};

describe('probes CRUD routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('creates a probe and returns the enroll token + install command', async () => {
    const response = await request(buildApp())
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);
    expect(response.body.probeId).toBe('europe-ovh-fra1');
    expect(response.body.enrollToken).toMatch(/^et_/);
    expect(response.body.installCommand).toContain('/enroll/');
    expect(response.body.installCommand).toContain('bootstrap.sh');
  });

  it('creates a probe without a host and leaves host null', async () => {
    const app = buildApp();
    const { host, ...withoutHost } = VALID;
    void host;
    await request(app)
      .post('/probes')
      .set(internalTokenHeader)
      .send(withoutHost)
      .expect(201);

    const detail = await request(app)
      .get('/probes/europe-ovh-fra1')
      .set(internalTokenHeader)
      .expect(200);
    expect(detail.body.host).toBeNull();
  });

  it('rejects a probe_id colliding with a Railway region slug (422)', async () => {
    await request(buildApp())
      .post('/probes')
      .set(internalTokenHeader)
      .send({ ...VALID, probeId: 'europe-west4-drams3a' })
      .expect(422);
  });

  it('rejects a malformed probe_id (400)', async () => {
    await request(buildApp())
      .post('/probes')
      .set(internalTokenHeader)
      .send({ ...VALID, probeId: 'Bad_Id' })
      .expect(400);
  });

  it('lists and fetches probes without secrets', async () => {
    const app = buildApp();
    await request(app)
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);

    const list = await request(app)
      .get('/probes')
      .set(internalTokenHeader)
      .expect(200);
    expect(list.body[0]).not.toHaveProperty('apiKeyHash');
    expect(list.body[0].host).toBe('203.0.113.10');

    const detail = await request(app)
      .get('/probes/europe-ovh-fra1')
      .set(internalTokenHeader)
      .expect(200);
    expect(detail.body.probeId).toBe('europe-ovh-fra1');
    expect(detail.body.host).toBe('203.0.113.10');

    await request(app)
      .get('/probes/missing')
      .set(internalTokenHeader)
      .expect(404);
  });

  it('patches mutable fields and refuses probe_id', async () => {
    const app = buildApp();
    await request(app)
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);

    const patched = await request(app)
      .patch('/probes/europe-ovh-fra1')
      .set(internalTokenHeader)
      .send({ lat: 51, probeId: 'hacked' })
      .expect(200);
    expect(patched.body.lat).toBe(51);
    expect(patched.body.probeId).toBe('europe-ovh-fra1');
  });

  it('patches the host', async () => {
    const app = buildApp();
    await request(app)
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);

    const patched = await request(app)
      .patch('/probes/europe-ovh-fra1')
      .set(internalTokenHeader)
      .send({ host: '198.51.100.7' })
      .expect(200);
    expect(patched.body.host).toBe('198.51.100.7');
  });

  it('rejects a malformed host on patch (400)', async () => {
    const app = buildApp();
    await request(app)
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);

    await request(app)
      .patch('/probes/europe-ovh-fra1')
      .set(internalTokenHeader)
      .send({ host: 'bad host!' })
      .expect(400);
  });

  it('regenerates an install one-liner with a fresh token', async () => {
    const app = buildApp();
    await request(app)
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);

    const install = await request(app)
      .get('/probes/europe-ovh-fra1/install')
      .set(internalTokenHeader)
      .expect(200);
    expect(install.body.installCommand).toContain('/enroll/');
  });
});
