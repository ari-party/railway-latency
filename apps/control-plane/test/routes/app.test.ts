import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { internalTokenHeader } from '../helpers/internalToken';
import { buildApp } from '@/app';
import { runMigrations } from '@/db/migrate';

describe('assembled app', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('responds OK on health without a token', async () => {
    await request(buildApp()).get('/').expect(200, 'OK');
  });

  it('rejects protected route groups without the internal token', async () => {
    const app = buildApp();
    await request(app).get('/probes').expect(401);
    await request(app).get('/internal/map-roster').expect(401);
  });

  it('serves protected route groups with the internal token', async () => {
    const app = buildApp();
    await request(app).get('/probes').set(internalTokenHeader).expect(200);
    await request(app)
      .get('/internal/map-roster')
      .set(internalTokenHeader)
      .expect(200);
  });

  it('keeps enroll reachable without the internal token', async () => {
    await request(buildApp())
      .get('/enroll/et_unknown/bootstrap.sh')
      .expect(404);
  });

  it('answers malformed JSON with a 4xx JSON body, not a leaked stack', async () => {
    const response = await request(buildApp())
      .post('/enroll/callhome')
      .set('content-type', 'application/json')
      .set('authorization', 'Bearer something')
      .send('{ not json')
      .expect(400);
    expect(response.body).toHaveProperty('message');
    // A leaked V8 stack would carry frame lines like "at fn (file:line:col)".
    expect(response.text).not.toMatch(/\bat\b.*:\d+:\d+\)/);
  });
});
