import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insertCheckEventsMock = vi.fn(
  async (_client: unknown, _rows: unknown) => undefined,
);

vi.mock('@railway-latency/clickhouse', () => ({
  createCheckEventClient: () => ({ marker: 'client' }),
  buildCheckEventRow: (src: string, event: { dst: string }) => ({
    src,
    dst: event.dst,
  }),
  insertCheckEvents: (client: unknown, rows: unknown) =>
    insertCheckEventsMock(client, rows),
}));

beforeEach(() => {
  process.env.CLICKHOUSE_URL = 'http://ch:8123';
  process.env.CLICKHOUSE_USERNAME = 'default';
  process.env.CLICKHOUSE_PASSWORD = 'x';
  process.env.CLICKHOUSE_DATABASE = 'latency';
  process.env.RAILWAY_REPLICA_REGIONS = 'europe-west4';
  process.env.INFLUXDB_URL = 'http://i';
  process.env.INFLUXDB_TOKEN = 't';
  process.env.INFLUXDB_ORG = 'o';
  process.env.INFLUXDB_BUCKET = 'b';
  process.env.CONTROL_PLANE_URL = 'http://c';
  process.env.CONTROL_PLANE_INTERNAL_TOKEN = 'k';
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

describe('writeExternalChecks', () => {
  it('inserts checks for trusted destinations within the time window', async () => {
    const { writeExternalChecks } = await import('@/services/clickhouse');
    const probe = { probeId: 'probe-iad' } as { probeId: string };
    writeExternalChecks(probe as never, [
      { dst: 'europe-west4', network: 'public', time: Date.now() } as never,
    ]);
    await vi.waitFor(() =>
      expect(insertCheckEventsMock).toHaveBeenCalledOnce(),
    );
  });

  it('drops checks for untrusted destinations', async () => {
    const { writeExternalChecks } = await import('@/services/clickhouse');
    writeExternalChecks({ probeId: 'probe-iad' } as never, [
      { dst: 'mars-west1', network: 'public', time: Date.now() } as never,
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(insertCheckEventsMock).not.toHaveBeenCalled();
  });
});
