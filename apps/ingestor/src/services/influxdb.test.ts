import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterProbe } from '@/types';
import type { ErrorEvent, ProbeSample } from '@railway-latency/types';

const writePointsSpy = vi.fn();
const closeSpy = vi.fn(async () => {});
const logErrorSpy = vi.fn();
let capturedWriteApiConfig: {
  writeOptions?: {
    writeFailed?: unknown;
    batchSize?: number;
    flushInterval?: number;
    maxRetries?: number;
    maxBufferLines?: number;
  };
} = {};

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
  EXTERNAL_MEASUREMENTS: new Set([
    'httpPublic',
    'dnsPublic',
    'handshakePublic',
    'httpProxied',
    'dnsProxied',
    'handshakeProxied',
    'httpPublicHikari',
    'httpProxiedHikari',
  ]),
  createWriteApi: (config: typeof capturedWriteApiConfig) => {
    capturedWriteApiConfig = config;
    return { writePoints: writePointsSpy, close: closeSpy };
  },
  buildSamplePoint: (src: string, sample: ProbeSample) =>
    new FakePoint(sample.measurement).tag('src', src).tag('dst', sample.dst),
  buildMtrPoint: (src: string, sample: ProbeSample) =>
    new FakePoint('mtr').tag('src', src).tag('dst', sample.dst),
  buildErrorPoint: (src: string, error: ErrorEvent) =>
    new FakePoint('error')
      .tag('src', src)
      .tag('dst', error.dst)
      .tag('network', error.network),
}));

vi.mock('@/pino', () => ({
  log: { error: logErrorSpy, warn: vi.fn(), info: vi.fn() },
}));

beforeEach(() => {
  vi.resetModules();
  writePointsSpy.mockClear();
  closeSpy.mockClear();
  logErrorSpy.mockClear();
  capturedWriteApiConfig = {};
  process.env.INFLUXDB_URL = 'http://influx:8086';
  process.env.INFLUXDB_TOKEN = 'write-only-token';
  process.env.INFLUXDB_ORG = 'railway';
  process.env.INFLUXDB_BUCKET = 'latency';
  process.env.CONTROL_PLANE_URL = 'http://cp:3000';
  process.env.CONTROL_PLANE_INTERNAL_TOKEN = 'test-internal-token';
  process.env.MAX_FUTURE_SKEW_MS = '60000';
  process.env.BUFFER_RETENTION_MS = '86400000';
  process.env.RAILWAY_REPLICA_REGIONS = 'us-west1, europe-west4';
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

describe('writeExternalSamples', () => {
  it('writes allowed samples tagged src=probeId and origin=external', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();
    const samples: ProbeSample[] = [
      { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 12.3 },
    ];

    writeExternalSamples(probe, samples);

    expect(writePointsSpy).toHaveBeenCalledOnce();
    const [points] = writePointsSpy.mock.calls[0];
    expect(points).toHaveLength(1);
    expect(points[0].tags).toMatchObject({
      src: 'asia-hcloud-sin1',
      dst: 'us-west1',
      origin: 'external',
    });
  });

  it('drops private measurements', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      { measurement: 'http', dst: 'us-west1', time: now, ms: 5 },
    ]);

    expect(writePointsSpy).not.toHaveBeenCalled();
  });

  it('drops far-future timestamps beyond MAX_FUTURE_SKEW_MS', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      {
        measurement: 'httpPublic',
        dst: 'us-west1',
        time: now + 120_000,
        ms: 5,
      },
    ]);

    expect(writePointsSpy).not.toHaveBeenCalled();
  });

  it('admits an old buffered sample within retention', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      {
        measurement: 'httpPublic',
        dst: 'us-west1',
        time: now - 3_600_000,
        ms: 5,
      },
    ]);

    expect(writePointsSpy).toHaveBeenCalledOnce();
  });

  it('drops samples older than BUFFER_RETENTION_MS', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      {
        measurement: 'httpPublic',
        dst: 'us-west1',
        time: now - 90_000_000,
        ms: 5,
      },
    ]);

    expect(writePointsSpy).not.toHaveBeenCalled();
  });

  it('drops rows whose dst is outside RAILWAY_REPLICA_REGIONS while keeping trusted rows', async () => {
    process.env.RAILWAY_REPLICA_REGIONS = 'us-west1, europe-west4';
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 5 },
      { measurement: 'httpPublic', dst: 'europe-west4', time: now, ms: 5 },
      { measurement: 'httpPublic', dst: 'attacker-region', time: now, ms: 5 },
    ]);

    expect(writePointsSpy).toHaveBeenCalledOnce();
    const [points] = writePointsSpy.mock.calls[0];
    expect(points).toHaveLength(2);
    expect(
      points.map((point: { tags: { dst: string } }) => point.tags.dst),
    ).toEqual(['us-west1', 'europe-west4']);
  });

  it('rejects every dst when RAILWAY_REPLICA_REGIONS is unset (fail closed)', async () => {
    delete process.env.RAILWAY_REPLICA_REGIONS;
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 5 },
    ]);

    expect(writePointsSpy).not.toHaveBeenCalled();
  });

  it('drops samples with negative, non-finite, or absurd ms', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: -1 },
      {
        measurement: 'httpPublic',
        dst: 'us-west1',
        time: now,
        ms: Number.POSITIVE_INFINITY,
      },
      { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: NaN },
      { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 1e12 },
      { measurement: 'httpPublic', dst: 'us-west1', time: now, ms: 42 },
    ]);

    expect(writePointsSpy).toHaveBeenCalledOnce();
    const [points] = writePointsSpy.mock.calls[0];
    expect(points).toHaveLength(1);
  });

  it('emits an extra mtr point, tagged external, when a sample carries hops', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      {
        measurement: 'httpProxied',
        dst: 'us-west1',
        time: now,
        ms: 12,
        mtr: [{ hop: 1, ip: '10.0.0.1', ms: 0.5 }],
      },
    ]);

    expect(writePointsSpy).toHaveBeenCalledOnce();
    const [points] = writePointsSpy.mock.calls[0];
    expect(
      points.map((point: { measurement: string }) => point.measurement),
    ).toEqual(['httpProxied', 'mtr']);
    expect(points[1].tags).toMatchObject({
      src: 'asia-hcloud-sin1',
      dst: 'us-west1',
      origin: 'external',
    });
  });

  it('does not emit an mtr point for an empty hop list', async () => {
    const { writeExternalSamples } = await import('@/services/influxdb');
    const now = Date.now();

    writeExternalSamples(probe, [
      {
        measurement: 'httpProxied',
        dst: 'us-west1',
        time: now,
        ms: 12,
        mtr: [],
      },
    ]);

    const [points] = writePointsSpy.mock.calls[0];
    expect(points).toHaveLength(1);
    expect(points[0].measurement).toBe('httpProxied');
  });
});

describe('writeExternalErrors', () => {
  it('writes allowed errors tagged origin=external and drops private-network rows', async () => {
    const { writeExternalErrors } = await import('@/services/influxdb');
    const now = Date.now();
    const errors: ErrorEvent[] = [
      { dst: 'us-west1', network: 'public', time: now, reason: 'timeout' },
      { dst: 'us-west1', network: 'private', time: now, reason: 'nope' },
    ];

    writeExternalErrors(probe, errors);

    expect(writePointsSpy).toHaveBeenCalledOnce();
    const [points] = writePointsSpy.mock.calls[0];
    expect(points).toHaveLength(1);
    expect(points[0].tags).toMatchObject({
      src: 'asia-hcloud-sin1',
      network: 'public',
      origin: 'external',
    });
  });
});

describe('write failure observability', () => {
  it('wires a writeFailed handler that logs the failure with line count and attempt', async () => {
    await import('@/services/influxdb');

    const writeFailed = capturedWriteApiConfig.writeOptions?.writeFailed as (
      error: Error,
      lines: string[],
      attempt: number,
    ) => void;
    expect(typeof writeFailed).toBe('function');

    writeFailed(new Error('influx 503'), ['line-a', 'line-b'], 2);

    expect(logErrorSpy).toHaveBeenCalledOnce();
    const [details, message] = logErrorSpy.mock.calls[0];
    expect(details).toMatchObject({ lines: 2, attempt: 2 });
    expect(message).toBe('InfluxDB write failed');
  });

  it('closeWriteApi flushes the underlying write API', async () => {
    const { closeWriteApi } = await import('@/services/influxdb');

    await closeWriteApi();

    expect(closeSpy).toHaveBeenCalledOnce();
  });
});
