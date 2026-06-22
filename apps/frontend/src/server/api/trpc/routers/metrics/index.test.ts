import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const aggregatorRef: { current: unknown } = { current: null };

vi.mock('@/server/services/aggregator', () => ({
  get aggregator() {
    return aggregatorRef.current;
  },
}));

vi.mock('@/server/utils/memoize', () => ({
  memoize: (_key: string, fn: () => unknown) => fn(),
}));

async function makeCaller() {
  const { createCallerFactory, createTRPCRouter } = await import(
    '@/server/api/trpc/context'
  );
  const { metricsRouter } = await import('@/server/api/trpc/routers/metrics');
  return createCallerFactory(createTRPCRouter({ metrics: metricsRouter }))({});
}

function makePoint(overrides: Record<string, unknown> = {}) {
  return {
    bucketMs: 1_700_000_000_000,
    p50: 12.5,
    p95: 40,
    p99: 80,
    total: 100,
    errors: 3,
    failures: 1,
    ...overrides,
  };
}

beforeEach(() => {
  process.env.RAILWAY_REPLICA_REGIONS = 'us-west1, europe-west4';
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  aggregatorRef.current = null;
});

describe('metrics.fleet', () => {
  it('posts the network and window to query/metrics and returns typed points', async () => {
    const payload = [
      makePoint(),
      makePoint({ p50: null, p95: null, p99: null }),
    ];
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    const result = await caller.metrics.fleet({
      range: '3h',
      network: 'public',
    });

    expect(post).toHaveBeenCalledWith('query/metrics', {
      json: expect.objectContaining({
        network: 'public',
        aggregateWindow: expect.any(String),
        rangeStart: expect.any(String),
        rangeEnd: expect.any(String),
      }),
    });
    expect(result).toHaveLength(2);
    expect(result?.[0].errors).toBe(3);
    expect(result?.[1].p50).toBeNull();
  });

  it('defaults to the private network', async () => {
    const post = vi.fn(() => ({ ok: true, json: async () => [] }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    await caller.metrics.fleet({ range: '3h' });

    expect(post).toHaveBeenCalledWith('query/metrics', {
      json: expect.objectContaining({ network: 'private' }),
    });
  });

  it('returns null when a point is malformed', async () => {
    const payload = [makePoint({ total: 'lots' })];
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();

    expect(await caller.metrics.fleet({ range: '3h' })).toBeNull();
  });

  it('returns null when the aggregator is unavailable', async () => {
    aggregatorRef.current = null;

    const caller = await makeCaller();

    expect(await caller.metrics.fleet({ range: '3h' })).toBeNull();
  });

  it('returns null when the aggregator responds with an error', async () => {
    aggregatorRef.current = {
      post: () => ({ ok: false, status: 503, json: async () => ({}) }),
    };

    const caller = await makeCaller();

    expect(await caller.metrics.fleet({ range: '3h' })).toBeNull();
  });
});
