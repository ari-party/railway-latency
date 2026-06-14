import { createHash } from 'node:crypto';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterCache } from '@/services/roster';
import type { RosterProbe } from '@/types';
import type { ErrorEvent, ProbeSample } from '@railway-latency/types';

const writePointsSpy = vi.fn();

class FakePoint {
  public measurement: string;

  public tags: Record<string, string> = {};

  constructor(measurement: string) {
    this.measurement = measurement;
  }

  tag(key: string, value: string) {
    this.tags[key] = value;
    return this;
  }
}

vi.mock('@railway-latency/influx', () => ({
  EXTERNAL_MEASUREMENTS: new Set(['httpPublic']),
  createWriteApi: () => ({ writePoints: writePointsSpy }),
  buildSamplePoint: (src: string, sample: ProbeSample) =>
    new FakePoint(sample.measurement).tag('src', src).tag('dst', sample.dst),
  buildErrorPoint: (src: string, error: ErrorEvent) =>
    new FakePoint('error')
      .tag('src', src)
      .tag('dst', error.dst)
      .tag('network', error.network),
}));

beforeEach(() => {
  vi.resetModules();
  writePointsSpy.mockClear();
  process.env.INFLUXDB_URL = 'http://influx:8086';
  process.env.INFLUXDB_TOKEN = 'write-only-token';
  process.env.INFLUXDB_ORG = 'railway';
  process.env.INFLUXDB_BUCKET = 'latency';
  process.env.CONTROL_PLANE_URL = 'http://cp:3000';
  process.env.CONTROL_PLANE_INTERNAL_TOKEN = 'test-internal-token';
  process.env.MAX_FUTURE_SKEW_MS = '60000';
  process.env.BUFFER_RETENTION_MS = '86400000';
  process.env.RAILWAY_REGION_SLUGS = 'us-west1';
});

afterEach(() => vi.restoreAllMocks());

const probeId = 'asia-hcloud-sin1';
const token = `rl_${probeId}_abcd1234zzzz`;
const prefix = `rl_${probeId}_abcd1234`;
const hash = createHash('sha256').update(token).digest('hex');

const probe: RosterProbe = {
  probeId,
  apiKeyPrefix: prefix,
  apiKeyHash: hash,
  lat: 1.29,
  lon: 103.85,
  status: 'active',
};

describe('createApp', () => {
  it('returns OK on the health route', async () => {
    const { createApp } = await import('@/index');
    const roster = {
      refresh: async () => {},
      resolve: async () => ({ probe }),
    };
    const app = createApp({ roster });

    const response = await request(app).get('/');
    expect(response.status).toBe(200);
    expect(response.text).toBe('OK');
  });

  it('401s an unauthenticated POST /ingest before parsing the body', async () => {
    const { createApp } = await import('@/index');
    const roster: RosterCache = {
      refresh: async () => {},
      resolve: async () => ({ unknown: true }),
    };
    const app = createApp({ roster });

    const response = await request(app)
      .post('/ingest')
      .send({ probeId, samples: [], errors: [] });

    expect(response.status).toBe(401);
  });

  it('returns a JSON 400 for a malformed-JSON body instead of Express HTML', async () => {
    const { createApp } = await import('@/index');
    const roster = {
      refresh: async () => {},
      resolve: async () => ({ probe }),
    };
    const app = createApp({ roster });

    const response = await request(app)
      .post('/ingest')
      .set('Authorization', `Bearer ${token}`)
      .set('Content-Type', 'application/json')
      .send('{ not valid json');

    expect(response.status).toBe(400);
    expect(response.type).toBe('application/json');
    expect(response.body).toEqual({ message: 'Bad request' });
  });

  it('202s an authenticated valid batch end to end', async () => {
    const { createApp } = await import('@/index');
    const roster = {
      refresh: async () => {},
      resolve: async () => ({ probe }),
    };
    const app = createApp({ roster });
    const now = Date.now();

    const response = await request(app)
      .post('/ingest')
      .set('Authorization', `Bearer ${token}`)
      .send({
        probeId,
        samples: [
          { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 7 },
        ],
        errors: [],
      });

    expect(response.status).toBe(202);
    expect(writePointsSpy).toHaveBeenCalled();
  });
});
