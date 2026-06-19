import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const insertCheckEventsMock = vi.fn(
  async (_client: unknown, _rows: unknown) => undefined,
);
const insertSamplesMock = vi.fn(
  async (_client: unknown, _rows: unknown) => undefined,
);
const insertErrorEventsMock = vi.fn(
  async (_client: unknown, _rows: unknown) => undefined,
);
const insertMtrEventsMock = vi.fn(
  async (_client: unknown, _rows: unknown) => undefined,
);

vi.mock('@railway-latency/clickhouse', () => ({
  createCheckEventClient: () => ({ marker: 'client' }),
  buildCheckEventRow: (src: string, event: { dst: string }) => ({
    src,
    dst: event.dst,
  }),
  buildSampleRow: (src: string, sample: { dst: string }, origin: string) => ({
    src,
    dst: sample.dst,
    origin,
  }),
  buildErrorEventRow: (
    src: string,
    event: { dst: string },
    origin: string,
  ) => ({
    src,
    dst: event.dst,
    origin,
  }),
  buildMtrEventRow: (
    src: string,
    sample: { dst: string },
    network: string,
  ) => ({
    src,
    dst: sample.dst,
    network,
  }),
  insertCheckEvents: (client: unknown, rows: unknown) =>
    insertCheckEventsMock(client, rows),
  insertSamples: (client: unknown, rows: unknown) =>
    insertSamplesMock(client, rows),
  insertErrorEvents: (client: unknown, rows: unknown) =>
    insertErrorEventsMock(client, rows),
  insertMtrEvents: (client: unknown, rows: unknown) =>
    insertMtrEventsMock(client, rows),
}));

const logWarnMock = vi.fn();

vi.mock('@/pino', () => ({
  log: { error: vi.fn(), warn: logWarnMock, info: vi.fn() },
}));

beforeEach(() => {
  process.env.CLICKHOUSE_URL = 'http://ch:8123';
  process.env.CLICKHOUSE_USERNAME = 'default';
  process.env.CLICKHOUSE_PASSWORD = 'x';
  process.env.CLICKHOUSE_DATABASE = 'latency';
  process.env.RAILWAY_REPLICA_REGIONS = 'europe-west4';
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

describe('writeExternalSamples', () => {
  it('writes external public samples to ClickHouse', async () => {
    const { writeExternalSamples } = await import('@/services/clickhouse');
    writeExternalSamples({ probeId: 'probe-ams' } as never, [
      {
        measurement: 'httpPublic',
        dst: 'europe-west4',
        time: Date.now(),
        ms: 10,
      } as never,
    ]);
    await vi.waitFor(() => expect(insertSamplesMock).toHaveBeenCalledOnce());
  });

  it('skips private-network samples', async () => {
    const { writeExternalSamples } = await import('@/services/clickhouse');
    writeExternalSamples({ probeId: 'probe-ams' } as never, [
      {
        measurement: 'http',
        dst: 'europe-west4',
        time: Date.now(),
        ms: 10,
      } as never,
    ]);
    await Promise.resolve();
    await Promise.resolve();
    expect(insertSamplesMock).not.toHaveBeenCalled();
  });

  it('warns with a dropped count for untrusted destinations', async () => {
    const { writeExternalSamples } = await import('@/services/clickhouse');
    writeExternalSamples({ probeId: 'probe-ams' } as never, [
      {
        measurement: 'httpPublic',
        dst: 'mars-west1',
        time: Date.now(),
        ms: 10,
      } as never,
    ]);
    expect(logWarnMock).toHaveBeenCalledWith(
      { name: 'clickhouse', probeId: 'probe-ams', dropped: 1 },
      'Dropped samples with untrusted dst',
    );
    expect(insertSamplesMock).not.toHaveBeenCalled();
  });

  it('warns with a dropped count for out-of-range durations', async () => {
    const { writeExternalSamples } = await import('@/services/clickhouse');
    writeExternalSamples({ probeId: 'probe-ams' } as never, [
      {
        measurement: 'httpPublic',
        dst: 'europe-west4',
        time: Date.now(),
        ms: -1,
      } as never,
    ]);
    expect(logWarnMock).toHaveBeenCalledWith(
      { name: 'clickhouse', probeId: 'probe-ams', dropped: 1 },
      'Dropped samples with out-of-range ms',
    );
    expect(insertSamplesMock).not.toHaveBeenCalled();
  });
});

describe('writeExternalErrors', () => {
  it('warns with a dropped count for untrusted destinations', async () => {
    const { writeExternalErrors } = await import('@/services/clickhouse');
    writeExternalErrors({ probeId: 'probe-ams' } as never, [
      {
        dst: 'mars-west1',
        network: 'public',
        time: Date.now(),
        reason: 'timeout',
      } as never,
    ]);
    expect(logWarnMock).toHaveBeenCalledWith(
      { name: 'clickhouse', probeId: 'probe-ams', dropped: 1 },
      'Dropped errors with untrusted dst',
    );
    expect(insertErrorEventsMock).not.toHaveBeenCalled();
  });
});
