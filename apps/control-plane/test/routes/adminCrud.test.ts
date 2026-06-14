import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { internalTokenHeader } from '../helpers/internalToken';
import { runMigrations } from '@/db/migrate';
import { requireInternalToken } from '@/middleware/internalToken';
import adminKeysRouter from '@/routes/adminKeys';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/admin-keys', requireInternalToken, adminKeysRouter);
  return app;
}

describe('admin keys routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('creates, lists and deletes an admin key', async () => {
    const app = buildApp();
    const created = await request(app)
      .post('/admin-keys')
      .set(internalTokenHeader)
      .send({ label: 'astrid', publicKey: 'ssh-ed25519 AAAA astrid' })
      .expect(201);
    expect(
      (
        await request(app)
          .get('/admin-keys')
          .set(internalTokenHeader)
          .expect(200)
      ).body,
    ).toHaveLength(1);

    await request(app)
      .delete(`/admin-keys/${created.body.id}`)
      .set(internalTokenHeader)
      .expect(204);
    expect(
      (
        await request(app)
          .get('/admin-keys')
          .set(internalTokenHeader)
          .expect(200)
      ).body,
    ).toHaveLength(0);
  });

  it('rejects a malformed admin key body', async () => {
    await request(buildApp())
      .post('/admin-keys')
      .set(internalTokenHeader)
      .send({ label: 'x' })
      .expect(400);
  });

  it('rejects a non-uuid id on delete with 400 instead of a 500', async () => {
    await request(buildApp())
      .delete('/admin-keys/not-a-uuid')
      .set(internalTokenHeader)
      .expect(400);
  });
});
