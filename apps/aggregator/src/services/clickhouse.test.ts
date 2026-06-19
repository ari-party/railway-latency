import { describe, expect, it, vi, beforeEach } from 'vitest';

const insertSamplesMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const insertErrorEventsMock = vi.fn((..._args: unknown[]) => Promise.resolve());
const insertMtrEventsMock = vi.fn((..._args: unknown[]) => Promise.resolve());

vi.mock('@railway-latency/clickhouse', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createCheckEventClient: () => ({ marker: 'client' }),
  runMigrations: vi.fn(),
  insertSamples: (...args: unknown[]) => insertSamplesMock(...args),
  insertErrorEvents: (...args: unknown[]) => insertErrorEventsMock(...args),
  insertMtrEvents: (...args: unknown[]) => insertMtrEventsMock(...args),
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
  vi.clearAllMocks();
});

describe('writeSampleRows', () => {
  it('inserts sample rows and mtr rows when hops are present', async () => {
    const { writeSampleRows } = await import('@/services/clickhouse');
    writeSampleRows('probe-ams', [
      {
        measurement: 'httpPublic',
        dst: 'europe-west4',
        time: 1_700_000_000_000,
        ms: 9,
        mtr: [{ hop: 1 }],
      },
    ]);
    expect(insertSamplesMock).toHaveBeenCalledTimes(1);
    expect(insertMtrEventsMock).toHaveBeenCalledTimes(1);
  });

  it('does not insert mtr rows when there are no hops', async () => {
    const { writeSampleRows } = await import('@/services/clickhouse');
    writeSampleRows('probe-ams', [
      {
        measurement: 'http',
        dst: 'europe-west4',
        time: 1_700_000_000_000,
        ms: 9,
      },
    ]);
    expect(insertSamplesMock).toHaveBeenCalledTimes(1);
    expect(insertMtrEventsMock).not.toHaveBeenCalled();
  });
});
