import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryCheckEventsMock = vi.fn();
const getCheckEventDetailMock = vi.fn();
const queryProbeRecentPopsMock = vi.fn();
const querySampleAggregatesMock = vi.fn();
const queryErrorAggregatesMock = vi.fn();
const queryFleetMetricsMock = vi.fn();
const queryLatestMtrMock = vi.fn();

vi.mock('@/services/clickhouse', () => ({
  checkEventClient: { marker: 'client' },
  runStartupMigrations: vi.fn(),
  writeChecks: vi.fn(),
  writeSampleRows: vi.fn(),
  writeErrorRows: vi.fn(),
}));

vi.mock('@railway-latency/clickhouse', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  queryCheckEvents: (...args: unknown[]) => queryCheckEventsMock(...args),
  getCheckEventDetail: (...args: unknown[]) => getCheckEventDetailMock(...args),
  queryProbeRecentPops: (...args: unknown[]) =>
    queryProbeRecentPopsMock(...args),
  querySampleAggregates: (...args: unknown[]) =>
    querySampleAggregatesMock(...args),
  queryErrorAggregates: (...args: unknown[]) =>
    queryErrorAggregatesMock(...args),
  queryFleetMetrics: (...args: unknown[]) => queryFleetMetricsMock(...args),
  queryLatestMtr: (...args: unknown[]) => queryLatestMtrMock(...args),
}));

beforeEach(() => {
  process.env.RAILWAY_REPLICA_REGIONS = 'europe-west4';
  process.env.CLICKHOUSE_URL = 'http://ch';
  process.env.CLICKHOUSE_USERNAME = 'default';
  process.env.CLICKHOUSE_PASSWORD = 'x';
  process.env.CLICKHOUSE_DATABASE = 'latency';
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

async function appWithQueryRouter() {
  const { default: queryRouter } = await import('@/routes/query');
  const app = express();
  app.use(express.json());
  app.use('/query', queryRouter);
  return app;
}

describe('POST /query/checks', () => {
  it('returns a trimmed page and cursor when more rows than the limit exist', async () => {
    queryCheckEventsMock.mockResolvedValue([
      {
        time: 1_700_000_002_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      },
      {
        time: 1_700_000_001_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      },
      {
        time: 1_700_000_000_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      },
    ]);
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/checks')
      .send({ query: '@network:public', limit: 2 });
    expect(response.status).toBe(200);
    expect(queryCheckEventsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 3 }),
    );
    expect(response.body.rows).toHaveLength(2);
    expect(response.body.cursor).toEqual({
      time: 1_700_000_001_000,
      src: 'probe-iad',
      dst: 'europe-west4',
      network: 'public',
    });
  });

  it('returns a null cursor on a partial last page', async () => {
    queryCheckEventsMock.mockResolvedValue([
      {
        time: 1_700_000_000_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      },
    ]);
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/checks')
      .send({ query: '@network:public', limit: 50 });
    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.cursor).toBeNull();
  });

  it('rejects unknown options', async () => {
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/checks')
      .send({ filters: { network: 'public' }, limit: 50 });
    expect(response.status).toBe(400);
  });

  it('rejects a range where from is after to', async () => {
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/checks')
      .send({ from: 1_700_000_001_000, to: 1_700_000_000_000, limit: 50 });
    expect(response.status).toBe(400);
  });

  it('rejects a text filter without a from bound', async () => {
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/checks')
      .send({ query: 'timeout', limit: 50 });
    expect(response.status).toBe(400);
  });

  it('accepts a valid bounded request', async () => {
    queryCheckEventsMock.mockResolvedValue([]);
    const app = await appWithQueryRouter();
    const response = await request(app).post('/query/checks').send({
      query: '@network:public',
      from: 1_700_000_000_000,
      to: 1_700_000_500_000,
      limit: 50,
    });
    expect(response.status).toBe(200);
  });
});

describe('POST /query/probe-pops', () => {
  it('returns the grouped routes for a valid request', async () => {
    queryProbeRecentPopsMock.mockResolvedValue([
      { dst: 'europe-west4', hikariPop: 'ams1', hits: 12 },
      { dst: 'europe-west4', hikariPop: 'cdg1', hits: 3 },
    ]);
    const app = await appWithQueryRouter();
    const response = await request(app).post('/query/probe-pops').send({
      src: 'probe-iad',
      network: 'public',
      sinceMs: 1_700_000_000_000,
    });

    expect(response.status).toBe(200);
    expect(queryProbeRecentPopsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        src: 'probe-iad',
        network: 'public',
        sinceMs: 1_700_000_000_000,
      }),
    );
    expect(response.body.routes).toHaveLength(2);
    expect(response.body.routes[0]).toEqual({
      dst: 'europe-west4',
      hikariPop: 'ams1',
      hits: 12,
    });
  });

  it('rejects a non public/proxied network', async () => {
    const app = await appWithQueryRouter();
    const response = await request(app).post('/query/probe-pops').send({
      src: 'probe-iad',
      network: 'private',
      sinceMs: 1_700_000_000_000,
    });
    expect(response.status).toBe(400);
  });

  it('rejects unknown options', async () => {
    const app = await appWithQueryRouter();
    const response = await request(app).post('/query/probe-pops').send({
      src: 'probe-iad',
      network: 'public',
      sinceMs: 1_700_000_000_000,
      limit: 50,
    });
    expect(response.status).toBe(400);
  });
});

describe('POST /query (samples)', () => {
  it('returns measurement,time,value CSV from ClickHouse rows', async () => {
    querySampleAggregatesMock.mockResolvedValue([
      { measurement: 'httpPublic', bucketMs: 1_700_000_000_000, value: 12.5 },
    ]);
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query')
      .send({
        src: 'probe-ams',
        dst: 'europe-west4',
        measurements: ['httpPublic'],
        rangeStart: '2023-11-14T22:00:00.000Z',
        rangeEnd: '2023-11-14T22:15:00.000Z',
        aggregateWindow: '2500ms',
      });
    expect(response.status).toBe(200);
    expect(response.text).toBe('httpPublic,2023-11-14T22:13:20.000Z,12.5\n');
  });

  it('returns an empty body when there are no sample rows', async () => {
    querySampleAggregatesMock.mockResolvedValue([]);
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query')
      .send({
        src: 'probe-ams',
        dst: 'europe-west4',
        measurements: ['httpPublic'],
        rangeStart: '2023-11-14T22:00:00.000Z',
        rangeEnd: '2023-11-14T22:15:00.000Z',
        aggregateWindow: '2500ms',
      });
    expect(response.status).toBe(200);
    expect(response.text).toBe('');
  });
});

describe('POST /query/errors', () => {
  it('returns time,reason CSV from ClickHouse rows', async () => {
    queryErrorAggregatesMock.mockResolvedValue([
      { bucketMs: 1_700_000_000_000, reason: 'connection reset' },
    ]);
    const app = await appWithQueryRouter();
    const response = await request(app).post('/query/errors').send({
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      rangeStart: '2023-11-14T22:00:00.000Z',
      rangeEnd: '2023-11-14T22:15:00.000Z',
      aggregateWindow: '2500ms',
    });
    expect(response.status).toBe(200);
    expect(response.text).toBe('2023-11-14T22:13:20.000Z,connection reset\n');
  });

  it('returns an empty body when there are no rows', async () => {
    queryErrorAggregatesMock.mockResolvedValue([]);
    const app = await appWithQueryRouter();
    const response = await request(app).post('/query/errors').send({
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      rangeStart: '2023-11-14T22:00:00.000Z',
      rangeEnd: '2023-11-14T22:15:00.000Z',
      aggregateWindow: '2500ms',
    });
    expect(response.status).toBe(200);
    expect(response.text).toBe('');
  });
});

describe('POST /query/metrics', () => {
  it('returns the aggregated metric rows as JSON', async () => {
    queryFleetMetricsMock.mockResolvedValue([
      {
        bucketMs: 1_700_000_000_000,
        p50: 12.5,
        p95: 40,
        p99: 80,
        total: 100,
        errors: 3,
        failures: 1,
      },
    ]);
    const app = await appWithQueryRouter();
    const response = await request(app).post('/query/metrics').send({
      network: 'private',
      rangeStart: '2023-11-14T22:00:00.000Z',
      rangeEnd: '2023-11-14T22:15:00.000Z',
      aggregateWindow: '10s',
    });
    expect(response.status).toBe(200);
    expect(queryFleetMetricsMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        network: 'private',
        rangeStartMs: Date.parse('2023-11-14T22:00:00.000Z'),
        rangeEndMs: Date.parse('2023-11-14T22:15:00.000Z'),
        windowMs: 10_000,
      }),
    );
    expect(response.body).toEqual([
      {
        bucketMs: 1_700_000_000_000,
        p50: 12.5,
        p95: 40,
        p99: 80,
        total: 100,
        errors: 3,
        failures: 1,
      },
    ]);
  });
});

describe('POST /query/mtr', () => {
  it('returns the latest hops as parsed JSON', async () => {
    queryLatestMtrMock.mockResolvedValue({
      timeMs: 1_700_000_000_000,
      hops: '[{"hop":1}]',
    });
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/mtr')
      .send({ src: 'probe-ams', dst: 'europe-west4', network: 'public' });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      time: '2023-11-14T22:13:20.000Z',
      hops: [{ hop: 1 }],
    });
  });

  it('returns null when there is no row', async () => {
    queryLatestMtrMock.mockResolvedValue(null);
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/mtr')
      .send({ src: 'probe-ams', dst: 'europe-west4', network: 'public' });
    expect(response.status).toBe(200);
    expect(response.body).toBeNull();
  });
});
