import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const aggregatorRef: { current: unknown } = { current: null };

vi.mock('@/server/services/aggregator', () => ({
  get aggregator() {
    return aggregatorRef.current;
  },
}));

async function makeCaller() {
  const { createCallerFactory, createTRPCRouter } = await import(
    '@/server/api/trpc/context'
  );
  const { mtrRouter } = await import('@/server/api/trpc/routers/mtr');
  const appRouter = createTRPCRouter({ mtr: mtrRouter });
  return createCallerFactory(appRouter)({ user: null });
}

beforeEach(() => {
  process.env.RAILWAY_REPLICA_REGIONS = 'us-west1, europe-west4';
});

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  aggregatorRef.current = null;
});

describe('mtrRouter.latest', () => {
  const input = {
    src: 'asia-hcloud-sin1',
    dst: 'us-west1',
    network: 'proxied',
  } as const;

  it('returns null when no aggregator is configured', async () => {
    aggregatorRef.current = null;
    const caller = await makeCaller();

    expect(await caller.mtr.latest(input)).toBeNull();
  });

  it('posts to query/mtr and returns the parsed path', async () => {
    const payload = {
      time: '2026-06-16T00:00:00Z',
      hops: [
        { hop: 1, ip: '10.0.0.1', ms: 0.5 },
        { hop: 2, ip: '203.0.113.7', ms: 12.3 },
      ],
    };
    const postMock = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post: postMock };

    const caller = await makeCaller();
    const result = await caller.mtr.latest(input);

    expect(postMock).toHaveBeenCalledWith('query/mtr', {
      json: { src: 'asia-hcloud-sin1', dst: 'us-west1', network: 'proxied' },
    });
    expect(result).toEqual(payload);
  });

  it('returns null when the aggregator responds with an error', async () => {
    aggregatorRef.current = {
      post: () => ({ ok: false, status: 503, json: async () => ({}) }),
    };
    const caller = await makeCaller();

    expect(await caller.mtr.latest(input)).toBeNull();
  });

  it('returns null when the response body fails schema validation', async () => {
    aggregatorRef.current = {
      post: () => ({
        ok: true,
        json: async () => ({ time: 123, hops: 'nope' }),
      }),
    };
    const caller = await makeCaller();

    expect(await caller.mtr.latest(input)).toBeNull();
  });

  it('passes a null body (no stored path) straight through', async () => {
    aggregatorRef.current = {
      post: () => ({ ok: true, json: async () => null }),
    };
    const caller = await makeCaller();

    expect(await caller.mtr.latest(input)).toBeNull();
  });
});
