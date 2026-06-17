import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const queryCheckEventsMock = vi.fn();
const getCheckEventDetailMock = vi.fn();

vi.mock('@/services/clickhouse', () => ({
  checkEventClient: { marker: 'client' },
  runStartupMigrations: vi.fn(),
  writeChecks: vi.fn(),
}));

vi.mock('@railway-latency/clickhouse', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  queryCheckEvents: (...args: unknown[]) => queryCheckEventsMock(...args),
  getCheckEventDetail: (...args: unknown[]) => getCheckEventDetailMock(...args),
}));

beforeEach(() => {
  process.env.RAILWAY_REPLICA_REGIONS = 'europe-west4';
  process.env.INFLUXDB_URL = 'http://i';
  process.env.INFLUXDB_TOKEN = 't';
  process.env.INFLUXDB_ORG = 'o';
  process.env.INFLUXDB_BUCKET = 'b';
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
      .send({ filters: { network: 'public' }, limit: 2 });
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
      .send({ filters: { network: 'public' }, limit: 50 });
    expect(response.status).toBe(200);
    expect(response.body.rows).toHaveLength(1);
    expect(response.body.cursor).toBeNull();
  });

  it('rejects a malformed filter', async () => {
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/checks')
      .send({ filters: { network: 'moon' }, limit: 50 });
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
      .send({ filters: { text: 'timeout' }, limit: 50 });
    expect(response.status).toBe(400);
  });

  it('accepts a valid bounded request', async () => {
    queryCheckEventsMock.mockResolvedValue([]);
    const app = await appWithQueryRouter();
    const response = await request(app)
      .post('/query/checks')
      .send({
        filters: { network: 'public' },
        from: 1_700_000_000_000,
        to: 1_700_000_500_000,
        limit: 50,
      });
    expect(response.status).toBe(200);
  });
});
