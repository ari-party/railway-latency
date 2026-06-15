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
import { isRunning } from '@/services/ansible';

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

async function recordRawEvent(
  probeId: string,
  kind: string,
  detail: Record<string, unknown> = {},
): Promise<void> {
  await testPool.query(
    'insert into events (probe_id, kind, detail) values ($1, $2, $3)',
    [probeId, kind, JSON.stringify(detail)],
  );
}

interface ProbeListItem {
  probeId: string;
  converge: {
    running: boolean;
    lastResult: string | null;
    lastEventAt: string | null;
  };
}

function findProbe(body: unknown[], probeId: string): ProbeListItem {
  const probe = (body as ProbeListItem[]).find(
    (item) => item.probeId === probeId,
  );
  if (!probe) throw new Error(`probe ${probeId} not found in response`);
  return probe;
}

describe('probe converge status + events route', () => {
  beforeEach(async () => {
    await resetDatabase();
    await runMigrations();
    await request(buildApp())
      .post('/probes')
      .set(internalTokenHeader)
      .send(VALID)
      .expect(201);
    vi.clearAllMocks();
    vi.mocked(isRunning).mockReturnValue(false);
  });

  afterAll(async () => {
    await testPool.end();
  });

  it('reports a null converge outcome when none has run', async () => {
    const response = await request(buildApp())
      .get('/probes')
      .set(internalTokenHeader)
      .expect(200);

    expect(findProbe(response.body, 'europe-ovh-fra1').converge).toEqual({
      running: false,
      lastResult: null,
      lastEventAt: null,
    });
  });

  it('reflects the latest converge outcome (a later failure overrides an earlier ok)', async () => {
    await recordRawEvent('europe-ovh-fra1', 'ansible_ok');
    await recordRawEvent('europe-ovh-fra1', 'ansible_failed', { code: 2 });

    const response = await request(buildApp())
      .get('/probes')
      .set(internalTokenHeader)
      .expect(200);

    const { converge } = findProbe(response.body, 'europe-ovh-fra1');
    expect(converge.lastResult).toBe('failed');
    expect(converge.lastEventAt).not.toBeNull();
  });

  it('breaks created_at ties by id so the later-inserted terminal event wins', async () => {
    await testPool.query(
      `insert into events (probe_id, kind, detail, created_at)
       values ('europe-ovh-fra1', 'ansible_ok', '{}', '2026-06-15T00:00:00Z'),
              ('europe-ovh-fra1', 'ansible_failed', '{}', '2026-06-15T00:00:00Z')`,
    );

    const response = await request(buildApp())
      .get('/probes')
      .set(internalTokenHeader)
      .expect(200);

    expect(
      findProbe(response.body, 'europe-ovh-fra1').converge.lastResult,
    ).toBe('failed');
  });

  it('surfaces converge.running from isRunning', async () => {
    vi.mocked(isRunning).mockReturnValue(true);

    const response = await request(buildApp())
      .get('/probes')
      .set(internalTokenHeader)
      .expect(200);

    expect(findProbe(response.body, 'europe-ovh-fra1').converge.running).toBe(
      true,
    );
  });

  it('treats converge_failed as a failed outcome', async () => {
    await recordRawEvent('europe-ovh-fra1', 'converge_failed', {
      reason: 'a play is already running',
    });

    const response = await request(buildApp())
      .get('/probes')
      .set(internalTokenHeader)
      .expect(200);

    expect(
      findProbe(response.body, 'europe-ovh-fra1').converge.lastResult,
    ).toBe('failed');
  });

  it('returns a probe events feed, newest first, with detail', async () => {
    await recordRawEvent('europe-ovh-fra1', 'ansible_ok', {
      tail: 'ok output',
    });

    const response = await request(buildApp())
      .get('/probes/europe-ovh-fra1/events')
      .set(internalTokenHeader)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body[0]).toMatchObject({
      kind: 'ansible_ok',
      detail: { tail: 'ok output' },
    });
    expect(response.body[0].createdAt).toBeTruthy();
  });

  it('rejects an out-of-range events limit (400)', async () => {
    await request(buildApp())
      .get('/probes/europe-ovh-fra1/events?limit=0')
      .set(internalTokenHeader)
      .expect(400);
  });

  it('update-all returns the dispatched probe ids', async () => {
    await testPool.query(
      `update probes set status = 'active' where probe_id = 'europe-ovh-fra1'`,
    );

    const response = await request(buildApp())
      .post('/probes/update-all')
      .set(internalTokenHeader)
      .send({ sha: 'abc1234' })
      .expect(202);

    expect(response.body.probeIds).toEqual(['europe-ovh-fra1']);
  });
});
