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
  const { checksRouter } = await import('@/server/api/trpc/routers/checks');
  return createCallerFactory(createTRPCRouter({ checks: checksRouter }))({});
}

function makeListRow(overrides: Record<string, unknown> = {}) {
  return {
    time: 1_699_999_999_000,
    src: 'probe-iad',
    dst: 'europe-west4',
    network: 'public',
    fail_stage: 'http',
    reason: 'timeout',
    dns_ms: 12,
    handshake_ms: 34,
    http_ms: null,
    http_status: null,
    railway_edge: 'us-east4-eqdc4a',
    cf_pop: 'IAD',
    hikari_pop: 'iad',
    request_id: 'req-123',
    body_truncated: false,
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

describe('checks.query', () => {
  it('posts the query to query/checks and returns typed rows + cursor', async () => {
    const cursor = {
      time: 1_699_999_999_000,
      src: 'probe-iad',
      dst: 'europe-west4',
      network: 'public',
    };
    const payload = { rows: [makeListRow()], cursor };
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    const result = await caller.checks.query({
      query: '@network:public',
      range: '3h',
      limit: 50,
    });

    expect(post).toHaveBeenCalledWith('query/checks', {
      json: expect.objectContaining({
        query: '@network:public',
        from: expect.any(Number),
        limit: 50,
      }),
    });
    expect(result?.rows).toHaveLength(1);
    expect(result?.rows[0].http_status).toBeNull();
    expect(result?.rows[0].body_truncated).toBe(false);
    expect(result?.cursor).toEqual({ ...cursor, from: expect.any(Number) });
  });

  it('threads the cursor window floor and strips it from the aggregator cursor', async () => {
    const post = vi.fn(() => ({
      ok: true,
      json: async () => ({ rows: [], cursor: null }),
    }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    await caller.checks.query({
      query: '',
      range: '3h',
      limit: 50,
      cursor: {
        time: 1_699_999_999_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
        from: 1_699_000_000_000,
      },
    });

    expect(post).toHaveBeenCalledWith('query/checks', {
      json: {
        query: '',
        from: 1_699_000_000_000,
        cursor: {
          time: 1_699_999_999_000,
          src: 'probe-iad',
          dst: 'europe-west4',
          network: 'public',
        },
        limit: 50,
      },
    });
  });

  it('returns null when a row is malformed', async () => {
    const payload = {
      rows: [makeListRow({ body_truncated: 'nope' })],
      cursor: null,
    };
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();

    expect(
      await caller.checks.query({ query: '', range: '3h', limit: 50 }),
    ).toBeNull();
  });

  it('returns null when the aggregator is unavailable', async () => {
    aggregatorRef.current = null;

    const caller = await makeCaller();

    expect(
      await caller.checks.query({ query: '', range: '3h', limit: 50 }),
    ).toBeNull();
  });

  it('returns null when the aggregator responds with an error', async () => {
    aggregatorRef.current = {
      post: () => ({ ok: false, status: 503, json: async () => ({}) }),
    };

    const caller = await makeCaller();

    expect(
      await caller.checks.query({ query: '', range: '3h', limit: 50 }),
    ).toBeNull();
  });
});

describe('checks.detail', () => {
  it('posts to query/checks/detail and returns the row', async () => {
    const payload = makeListRow({
      time: 1_700_000_000_000,
      headers: { 'content-type': 'application/json' },
      body: '{"ok":true}',
    });
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    const result = await caller.checks.detail({
      time: 1_700_000_000_000,
      src: 'probe-iad',
      dst: 'europe-west4',
      network: 'public',
    });

    expect(post).toHaveBeenCalledWith('query/checks/detail', {
      json: {
        time: 1_700_000_000_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      },
    });
    expect(result).toEqual(payload);
    expect(result?.headers['content-type']).toBe('application/json');
  });

  it('returns null when the detail row is malformed', async () => {
    const payload = makeListRow({ headers: { 'content-type': 'text/html' } });
    const post = vi.fn(() => ({ ok: true, json: async () => payload }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();

    expect(
      await caller.checks.detail({
        time: 1,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      }),
    ).toBeNull();
  });

  it('returns null when the aggregator is unavailable', async () => {
    aggregatorRef.current = null;

    const caller = await makeCaller();

    expect(
      await caller.checks.detail({
        time: 1,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      }),
    ).toBeNull();
  });

  it('returns null when the aggregator responds with an error', async () => {
    aggregatorRef.current = {
      post: () => ({ ok: false, status: 503, json: async () => null }),
    };

    const caller = await makeCaller();

    expect(
      await caller.checks.detail({
        time: 1,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      }),
    ).toBeNull();
  });
});
