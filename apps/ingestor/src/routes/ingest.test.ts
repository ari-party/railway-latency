import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterProbe } from '@/types';

beforeEach(() => {
  vi.resetModules();
  process.env.CONTROL_PLANE_URL = 'http://cp:3000';
  process.env.CONTROL_PLANE_INTERNAL_TOKEN = 'test-internal-token';
  process.env.MAX_FUTURE_SKEW_MS = '60000';
  process.env.BUFFER_RETENTION_MS = '86400000';
  process.env.CLICKHOUSE_URL = 'http://ch:8123';
  process.env.CLICKHOUSE_USERNAME = 'default';
  process.env.CLICKHOUSE_PASSWORD = 'x';
  process.env.CLICKHOUSE_DATABASE = 'latency';
});

afterEach(() => vi.restoreAllMocks());

const probe: RosterProbe = {
  probeId: 'asia-hcloud-sin1',
  apiKeyPrefix: 'rl_asia-hcloud-sin1_abcd1234',
  apiKeyHash: 'deadbeef',
  lat: 1.29,
  lon: 103.85,
  status: 'active',
};

async function buildApp(overrides: { consume?: () => boolean } = {}) {
  const writeExternalSamples = vi.fn();
  const writeExternalErrors = vi.fn();
  const writeExternalChecks = vi.fn();
  const recordSeen = vi.fn();

  const { createIngestRouter } = await import('@/routes/ingest');
  const router = createIngestRouter({
    rateLimiter: { consume: overrides.consume ?? (() => true) },
    writeExternalSamples,
    writeExternalErrors,
    writeExternalChecks,
    seenReporter: { record: recordSeen, flush: vi.fn() },
  });

  const app = express();
  app.use((req, _res, next) => {
    req.probe = probe;
    next();
  });
  app.use(express.json());
  app.use('/ingest', router);

  return {
    app,
    writeExternalSamples,
    writeExternalErrors,
    writeExternalChecks,
    recordSeen,
  };
}

describe('ingestSchema envelope validation', () => {
  it('rejects a non-array samples field', async () => {
    const { ingestSchema } = await import('@/routes/ingest');

    const result = ingestSchema.safeParse({
      probeId: 'asia-hcloud-sin1',
      samples: 'not-an-array',
      errors: [],
    });

    expect(result.success).toBe(false);
  });

  it('rejects more than 600 elements in an array', async () => {
    const { ingestSchema } = await import('@/routes/ingest');

    const result = ingestSchema.safeParse({
      probeId: 'asia-hcloud-sin1',
      samples: Array.from({ length: 601 }, () => ({})),
      errors: [],
    });

    expect(result.success).toBe(false);
  });

  it('admits opaque element shapes so per-element validation can run downstream', async () => {
    const { ingestSchema } = await import('@/routes/ingest');

    const result = ingestSchema.safeParse({
      probeId: 'asia-hcloud-sin1',
      samples: [
        { measurement: 'httpPublic', dst: 'us-west1', time: NaN, ms: 9 },
      ],
      errors: [{ anything: true }],
    });

    expect(result.success).toBe(true);
  });
});

describe('POST /ingest', () => {
  it('202s a valid batch, writes, and records liveness', async () => {
    const { app, writeExternalSamples, writeExternalErrors, recordSeen } =
      await buildApp();
    const now = Date.now();

    const response = await request(app)
      .post('/ingest')
      .send({
        probeId: 'asia-hcloud-sin1',
        samples: [
          { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 9 },
        ],
        errors: [],
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: { samples: 1, errors: 0 } });
    expect(writeExternalSamples).toHaveBeenCalledOnce();
    expect(writeExternalErrors).toHaveBeenCalledOnce();
    expect(recordSeen).toHaveBeenCalledWith('asia-hcloud-sin1');
  });

  it('admits baseline samples against the fixed baseline destination', async () => {
    const { app, writeExternalSamples } = await buildApp();
    const now = Date.now();

    const response = await request(app)
      .post('/ingest')
      .send({
        probeId: 'asia-hcloud-sin1',
        samples: [
          { measurement: 'httpBaseline', dst: 'baseline', time: now, ms: 14 },
          { measurement: 'dnsBaseline', dst: 'baseline', time: now, ms: 2 },
        ],
        errors: [],
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: { samples: 2, errors: 0 } });
    const writtenSamples = writeExternalSamples.mock.calls[0][1];
    expect(
      writtenSamples.map(
        (sample: { measurement: string }) => sample.measurement,
      ),
    ).toEqual(['httpBaseline', 'dnsBaseline']);
  });

  it('202s, dropping only schema-invalid elements and writing the valid ones', async () => {
    const { app, writeExternalSamples, writeExternalErrors, recordSeen } =
      await buildApp();
    const now = Date.now();

    const response = await request(app)
      .post('/ingest')
      .send({
        probeId: 'asia-hcloud-sin1',
        samples: [
          { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 9 },
          { measurement: 'httpPublic', dst: 'Bad_Dst', time: now, ms: 9 },
          { measurement: 'http', dst: 'eu-west1', time: now, ms: 12 },
        ],
        errors: [
          { dst: 'us-west1', network: 'public', time: now, reason: 'timeout' },
          {
            dst: 'us-west1',
            network: 'public',
            time: now,
            reason: 'x'.repeat(257),
          },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: { samples: 2, errors: 1 } });

    expect(writeExternalSamples).toHaveBeenCalledOnce();
    const writtenSamples = writeExternalSamples.mock.calls[0][1];
    expect(writtenSamples.map((sample: { dst: string }) => sample.dst)).toEqual(
      ['us-west1', 'eu-west1'],
    );

    expect(writeExternalErrors).toHaveBeenCalledOnce();
    expect(writeExternalErrors.mock.calls[0][1]).toHaveLength(1);

    expect(recordSeen).toHaveBeenCalledWith('asia-hcloud-sin1');
  });

  it('403s when the body probeId does not match the verified key', async () => {
    const { app, writeExternalSamples } = await buildApp();

    const response = await request(app)
      .post('/ingest')
      .send({ probeId: 'europe-ovh-fra1', samples: [], errors: [] });

    expect(response.status).toBe(403);
    expect(writeExternalSamples).not.toHaveBeenCalled();
  });

  it('400s a malformed body (bad probeId regex)', async () => {
    const { app } = await buildApp();

    const response = await request(app)
      .post('/ingest')
      .send({ probeId: 'Bad_Id', samples: [], errors: [] });

    expect(response.status).toBe(400);
  });

  it('drops a sample whose time is non-finite without writing it (still 202)', async () => {
    const { app, writeExternalSamples } = await buildApp();

    const response = await request(app)
      .post('/ingest')
      .send({
        probeId: 'asia-hcloud-sin1',
        samples: [
          { measurement: 'httpPublic', dst: 'us-west1', time: null, ms: 9 },
        ],
        errors: [],
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: { samples: 0, errors: 0 } });
    expect(writeExternalSamples).toHaveBeenCalledWith(probe, []);
  });

  it('drops an error event whose time is non-integer without writing it (still 202)', async () => {
    const { app, writeExternalErrors } = await buildApp();

    const response = await request(app)
      .post('/ingest')
      .send({
        probeId: 'asia-hcloud-sin1',
        samples: [],
        errors: [
          {
            dst: 'us-west1',
            network: 'public',
            time: 1.5,
            reason: 'timeout',
          },
        ],
      });

    expect(response.status).toBe(202);
    expect(response.body).toEqual({ accepted: { samples: 0, errors: 0 } });
    expect(writeExternalErrors).toHaveBeenCalledWith(probe, []);
  });

  it('429s when the per-probe bucket is empty', async () => {
    const { app, writeExternalSamples } = await buildApp({
      consume: () => false,
    });

    const response = await request(app)
      .post('/ingest')
      .send({ probeId: 'asia-hcloud-sin1', samples: [], errors: [] });

    expect(response.status).toBe(429);
    expect(writeExternalSamples).not.toHaveBeenCalled();
  });

  it('passes valid checks to writeExternalChecks', async () => {
    const { app, writeExternalChecks } = await buildApp();
    const now = Date.now();

    const response = await request(app)
      .post('/ingest')
      .send({
        probeId: 'asia-hcloud-sin1',
        samples: [],
        errors: [],
        checks: [
          { dst: 'us-west1', network: 'public', time: now, httpStatus: 200 },
        ],
      });

    expect(response.status).toBe(202);
    expect(writeExternalChecks).toHaveBeenCalledOnce();
    const writtenChecks = writeExternalChecks.mock.calls[0][1];
    expect(writtenChecks).toHaveLength(1);
    expect(writtenChecks[0].dst).toBe('us-west1');
  });

  it('drops schema-invalid checks without 400ing the batch', async () => {
    const { app, writeExternalChecks } = await buildApp();
    const now = Date.now();

    const response = await request(app)
      .post('/ingest')
      .send({
        probeId: 'asia-hcloud-sin1',
        samples: [],
        errors: [],
        checks: [
          { dst: 'us-west1', network: 'public', time: now },
          { dst: 'Bad_Dst', network: 'public', time: now },
          { dst: 'eu-west1', network: 'public', time: now, httpStatus: 99 },
          { dst: 'eu-west2', network: 'public', time: 1.5 },
        ],
      });

    expect(response.status).toBe(202);
    expect(writeExternalChecks).toHaveBeenCalledOnce();
    const writtenChecks = writeExternalChecks.mock.calls[0][1];
    expect(writtenChecks).toHaveLength(1);
    expect(writtenChecks[0].dst).toBe('us-west1');
  });

  it('calls writeExternalChecks with empty array when no checks key is present', async () => {
    const { app, writeExternalChecks } = await buildApp();

    const response = await request(app)
      .post('/ingest')
      .send({ probeId: 'asia-hcloud-sin1', samples: [], errors: [] });

    expect(response.status).toBe(202);
    expect(writeExternalChecks).toHaveBeenCalledWith(probe, []);
  });
});
