import express from 'express';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { resetDatabase, testPool } from '../helpers/db';
import { internalTokenHeader } from '../helpers/internalToken';
import { runMigrations } from '@/db/migrate';
import { createProbe, setProbeApiKey } from '@/db/probes';
import { requireInternalToken } from '@/middleware/internalToken';
import internalRouter from '@/routes/internal';
import { secretStash } from '@/services/secretStash';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/internal', requireInternalToken, internalRouter);
  return app;
}

async function activate(probeId: string) {
  await testPool.query(
    `update probes set status = 'active' where probe_id = $1`,
    [probeId],
  );
}

describe('internal routes', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('GET /internal/roster returns hash material for keyed probes', async () => {
    await createProbe({
      probeId: 'europe-ovh-fra1',
      lat: 1,
      lon: 2,
      host: '203.0.113.10',
    });
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_p0000000',
    });
    await activate('europe-ovh-fra1');

    const response = await request(buildApp())
      .get('/internal/roster')
      .set(internalTokenHeader)
      .expect(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].apiKeyHash).toBe('aa');
    expect(response.body[0].apiKeyPrefix).toBe('rl_europe-ovh-fra1_p0000000');
  });

  it('GET /internal/map-roster hides secrets', async () => {
    await createProbe({
      probeId: 'europe-ovh-fra1',
      lat: 1,
      lon: 2,
      host: '203.0.113.10',
    });
    const response = await request(buildApp())
      .get('/internal/map-roster')
      .set(internalTokenHeader)
      .expect(200);
    expect(response.body[0]).not.toHaveProperty('apiKeyHash');
    expect(response.body[0]).not.toHaveProperty('lastSeen');
    expect(response.body[0].status).toBe('inactive');
  });

  it('GET /internal/inventory emits ansible hostvars with the transient api key only while stashed', async () => {
    await createProbe({
      probeId: 'europe-ovh-fra1',
      lat: 1,
      lon: 2,
      host: '203.0.113.10',
    });
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_p0000000',
    });
    await testPool.query(
      `update probes set status = 'enrolled' where probe_id = 'europe-ovh-fra1'`,
    );
    secretStash.put(
      'europe-ovh-fra1',
      { apiKey: 'rl_europe-ovh-fra1_plain' },
      60 * 1_000,
    );

    const response = await request(buildApp())
      .get('/internal/inventory')
      .set(internalTokenHeader)
      .expect(200);
    const hostvars = response.body._meta.hostvars['europe-ovh-fra1'];
    expect(response.body.probes.hosts).toContain('europe-ovh-fra1');
    expect(hostvars.ansible_host).toBe('203.0.113.10');
    expect(hostvars.probe_api_key).toBe('rl_europe-ovh-fra1_plain');
    expect(hostvars).not.toHaveProperty('control_plane_shared_secret');
    expect(hostvars).not.toHaveProperty('allowed_targets');
  });

  it('POST /internal/seen advances last_seen', async () => {
    await createProbe({
      probeId: 'europe-ovh-fra1',
      lat: 1,
      lon: 2,
      host: '203.0.113.10',
    });
    await setProbeApiKey('europe-ovh-fra1', {
      hash: Buffer.from('aa', 'hex'),
      prefix: 'rl_europe-ovh-fra1_p0000000',
    });
    await activate('europe-ovh-fra1');

    await request(buildApp())
      .post('/internal/seen')
      .set(internalTokenHeader)
      .send([{ probeId: 'europe-ovh-fra1', ts: Date.now() }])
      .expect(204);

    const map = await request(buildApp())
      .get('/internal/map-roster')
      .set(internalTokenHeader)
      .expect(200);
    expect(map.body[0].status).toBe('green');
  });
});
