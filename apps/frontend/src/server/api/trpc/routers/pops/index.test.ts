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
  const { popsRouter } = await import('@/server/api/trpc/routers/pops');
  return createCallerFactory(createTRPCRouter({ pops: popsRouter }))({});
}

beforeEach(() => {
  process.env.RAILWAY_REPLICA_REGIONS = 'us-west2, europe-west4';
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  aggregatorRef.current = null;
});

describe('pops.list', () => {
  it('returns the pop codes from the aggregator, ordered as received', async () => {
    const post = vi.fn(() => ({
      ok: true,
      json: async () => [
        { pop: 'ams1', hits: 40 },
        { pop: 'fra2', hits: 12 },
      ],
    }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    const result = await caller.pops.list();

    expect(post).toHaveBeenCalledWith('query/pops', {
      json: expect.objectContaining({ sinceMs: expect.any(Number) }),
    });
    expect(result).toEqual(['ams1', 'fra2']);
  });

  it('returns null when the aggregator is unavailable', async () => {
    aggregatorRef.current = null;

    const caller = await makeCaller();

    expect(await caller.pops.list()).toBeNull();
  });

  it('returns null when the aggregator responds with an error', async () => {
    aggregatorRef.current = {
      post: () => ({ ok: false, status: 404, json: async () => ({}) }),
    };

    const caller = await makeCaller();

    expect(await caller.pops.list()).toBeNull();
  });
});

describe('pops.latency', () => {
  it('posts the pop, target and window to query/pop-latency and returns typed points', async () => {
    const payload = [
      { probe: 'miami', dst: 'us-west2', bucketMs: 1_700_000_000_000, p95: 21.4 },
      { probe: 'dallas', dst: 'us-west2', bucketMs: 1_700_000_000_000, p95: null },
    ];
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    const result = await caller.pops.latency({
      pop: 'ams1',
      dst: 'us-west2',
      range: '3h',
    });

    expect(post).toHaveBeenCalledWith('query/pop-latency', {
      json: expect.objectContaining({
        pop: 'ams1',
        dst: 'us-west2',
        aggregateWindow: expect.any(String),
        rangeStart: expect.any(String),
        rangeEnd: expect.any(String),
      }),
    });
    expect(result).toHaveLength(2);
    expect(result?.[1].p95).toBeNull();
  });

  it('defaults the target to null (all regions)', async () => {
    const post = vi.fn(() => ({ ok: true, json: async () => [] }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    await caller.pops.latency({ pop: 'ams1', range: '3h' });

    expect(post).toHaveBeenCalledWith('query/pop-latency', {
      json: expect.objectContaining({ dst: null }),
    });
  });

  it('returns null when a point is malformed', async () => {
    const payload = [{ probe: 'miami', bucketMs: 'soon', p95: 1 }];
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();

    expect(
      await caller.pops.latency({ pop: 'ams1', range: '3h' }),
    ).toBeNull();
  });
});
