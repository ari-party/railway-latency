import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProbeMetadata } from '@railway-latency/types';

const memoizeMock = vi.fn();
const getJsonMock = vi.fn();
const controlPlaneRef: { current: unknown } = { current: null };
const aggregatorRef: { current: unknown } = { current: null };

vi.mock('@/server/utils/memoize', () => ({
  memoize: (key: string, fn: () => Promise<unknown>, ttl?: number) =>
    memoizeMock(key, fn, ttl),
}));

vi.mock('@/server/services/controlPlane', () => ({
  get controlPlane() {
    return controlPlaneRef.current;
  },
}));

vi.mock('@/server/services/aggregator', () => ({
  get aggregator() {
    return aggregatorRef.current;
  },
}));

async function makeCaller() {
  const { createCallerFactory, createTRPCRouter } = await import(
    '@/server/api/trpc/context'
  );
  const { probesRouter } = await import('@/server/api/trpc/routers/probes');
  const appRouter = createTRPCRouter({ probes: probesRouter });
  return createCallerFactory(appRouter)({ user: null });
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
  controlPlaneRef.current = null;
  aggregatorRef.current = null;
});

describe('probesRouter.list', () => {
  it('returns an empty list when no control plane is configured', async () => {
    controlPlaneRef.current = null;
    const caller = await makeCaller();

    expect(await caller.probes.list()).toEqual([]);
    expect(memoizeMock).not.toHaveBeenCalled();
  });

  it('memoizes the map-roster fetch under the expected key and TTL', async () => {
    controlPlaneRef.current = {
      get: () => ({ ok: true, json: getJsonMock }),
    };
    getJsonMock.mockResolvedValue([]);
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    await caller.probes.list();

    expect(memoizeMock).toHaveBeenCalledWith(
      'probes:map-roster',
      expect.any(Function),
      30,
    );
  });

  it('fetches internal/map-roster from the control plane', async () => {
    const getMock = vi.fn(() => ({ ok: true, json: getJsonMock }));
    controlPlaneRef.current = { get: getMock };
    getJsonMock.mockResolvedValue([]);
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    await caller.probes.list();

    expect(getMock).toHaveBeenCalledWith('internal/map-roster');
  });

  it('returns the map-roster metadata as provided by the control plane', async () => {
    const roster: ProbeMetadata[] = [
      {
        probeId: 'asia-hcloud-sin1',
        lat: 1.29,
        lon: 103.85,
        status: 'down',
        asn: null,
      },
    ];
    controlPlaneRef.current = { get: () => ({ ok: true, json: getJsonMock }) };
    getJsonMock.mockResolvedValue(roster);
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    const result = await caller.probes.list();

    expect(result).toEqual(roster);
  });

  it('returns an empty list when the control plane responds with an error', async () => {
    controlPlaneRef.current = {
      get: () => ({ ok: false, status: 503, json: getJsonMock }),
    };
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    const result = await caller.probes.list();

    expect(result).toEqual([]);
    expect(getJsonMock).not.toHaveBeenCalled();
  });

  it('lets the memoized fetcher throw on a transient failure so the empty fallback is not cached', async () => {
    controlPlaneRef.current = {
      get: () => ({ ok: false, status: 503, json: getJsonMock }),
    };
    // The fetcher handed to memoize must reject, not resolve to [], or memoize
    // would cache the empty roster for the full TTL.
    let memoizedFetcher: (() => Promise<unknown>) | undefined;
    memoizeMock.mockImplementation(async (_key, fn) => {
      memoizedFetcher = fn;
      return [];
    });

    const caller = await makeCaller();
    await caller.probes.list();

    expect(memoizedFetcher).toBeDefined();
    await expect(memoizedFetcher!()).rejects.toThrow();
  });

  it('drops roster entries that fail validation', async () => {
    const roster = [
      {
        probeId: 'asia-hcloud-sin1',
        lat: 1.29,
        lon: 103.85,
        status: 'down',
      },
      { probeId: 'bad-coord', lat: Number.NaN, lon: 0, status: 'green' },
      { probeId: 'bad-status', lat: 0, lon: 0, status: 'unknown' },
    ];
    controlPlaneRef.current = { get: () => ({ ok: true, json: getJsonMock }) };
    getJsonMock.mockResolvedValue(roster);
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    const result = await caller.probes.list();

    expect(result).toEqual([
      {
        probeId: 'asia-hcloud-sin1',
        lat: 1.29,
        lon: 103.85,
        status: 'down',
        asn: null,
      },
    ]);
  });

  it('returns an empty list when the control plane responds with a non-array body', async () => {
    controlPlaneRef.current = {
      get: () => ({ ok: true, json: getJsonMock }),
    };
    getJsonMock.mockResolvedValue({ message: 'internal error' });
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    const result = await caller.probes.list();

    expect(result).toEqual([]);
  });

  it('returns an empty list when the fetch rejects', async () => {
    controlPlaneRef.current = {
      get: () => Promise.reject(new Error('network unreachable')),
    };
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    const result = await caller.probes.list();

    expect(result).toEqual([]);
  });

  it('returns an empty list when the response body fails to parse', async () => {
    controlPlaneRef.current = {
      get: () => ({ ok: true, json: getJsonMock }),
    };
    getJsonMock.mockRejectedValue(new Error('invalid json'));
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    const result = await caller.probes.list();

    expect(result).toEqual([]);
  });
});

describe('probesRouter.recentPops', () => {
  it('posts a server-resolved window to query/probe-pops and returns routes', async () => {
    const routes = [
      {
        dst: 'europe-west4',
        cfPop: '',
        hikariPop: 'ams1',
        hits: 12,
        latencyMs: 24,
      },
      {
        dst: 'europe-west4',
        cfPop: '',
        hikariPop: 'cdg1',
        hits: 3,
        latencyMs: null,
      },
    ];
    const post = vi.fn(() => ({ ok: true, json: async () => ({ routes }) }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    const result = await caller.probes.recentPops({
      src: 'probe-iad',
      network: 'public',
    });

    expect(post).toHaveBeenCalledWith('query/probe-pops', {
      json: {
        src: 'probe-iad',
        network: 'public',
        sinceMs: expect.any(Number),
      },
    });
    expect(result).toEqual(routes);
  });

  it('defaults latencyMs to null when the aggregator omits it', async () => {
    const post = vi.fn(() => ({
      ok: true,
      json: async () => ({
        routes: [{ dst: 'europe-west4', hikariPop: 'ams1', hits: 5 }],
      }),
    }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();
    const result = await caller.probes.recentPops({
      src: 'probe-iad',
      network: 'public',
    });

    expect(result).toEqual([
      {
        dst: 'europe-west4',
        cfPop: '',
        hikariPop: 'ams1',
        hits: 5,
        latencyMs: null,
      },
    ]);
  });

  it('returns [] when the aggregator is unavailable', async () => {
    aggregatorRef.current = null;

    const caller = await makeCaller();

    expect(
      await caller.probes.recentPops({ src: 'probe-iad', network: 'public' }),
    ).toEqual([]);
  });

  it('returns [] when the aggregator responds with an error', async () => {
    aggregatorRef.current = {
      post: () => ({ ok: false, status: 503, json: async () => ({}) }),
    };

    const caller = await makeCaller();

    expect(
      await caller.probes.recentPops({ src: 'probe-iad', network: 'proxied' }),
    ).toEqual([]);
  });

  it('returns [] when the aggregator fetch rejects', async () => {
    aggregatorRef.current = {
      post: () => Promise.reject(new Error('connection refused')),
    };

    const caller = await makeCaller();

    expect(
      await caller.probes.recentPops({ src: 'probe-iad', network: 'public' }),
    ).toEqual([]);
  });

  it('returns [] when the aggregator response is malformed', async () => {
    const post = vi.fn(() => ({
      ok: true,
      json: async () => ({ routes: [{ dst: 'europe-west4', hits: 'lots' }] }),
    }));
    aggregatorRef.current = { post };

    const caller = await makeCaller();

    expect(
      await caller.probes.recentPops({ src: 'probe-iad', network: 'public' }),
    ).toEqual([]);
  });
});

describe('probesRouter.cloudflareLocations', () => {
  it('fetches with the Referer header, trims fields, and memoizes for 1h', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => [
        {
          iata: 'AMS',
          lat: 52.31,
          lon: 4.76,
          cca2: 'NL',
          region: 'Europe',
          city: 'Amsterdam',
        },
      ],
    }));
    vi.stubGlobal('fetch', fetchMock);
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();
    const result = await caller.probes.cloudflareLocations();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://speed.cloudflare.com/locations',
      { headers: { Referer: 'https://speed.cloudflare.com' } },
    );
    expect(memoizeMock).toHaveBeenCalledWith(
      'cloudflare:locations',
      expect.any(Function),
      3600,
    );
    expect(result).toEqual([
      { iata: 'AMS', lat: 52.31, lon: 4.76, city: 'Amsterdam' },
    ]);
  });

  it('drops entries that fail validation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => [
          { iata: 'AMS', lat: 52.31, lon: 4.76, city: 'Amsterdam' },
          { iata: 'BAD', lat: 'nope', lon: 4.76, city: 'Broken' },
        ],
      })),
    );
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();

    expect(await caller.probes.cloudflareLocations()).toEqual([
      { iata: 'AMS', lat: 52.31, lon: 4.76, city: 'Amsterdam' },
    ]);
  });

  it('returns [] when the upstream responds with an error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503 })),
    );
    memoizeMock.mockImplementation(async (_key, fn) => fn());

    const caller = await makeCaller();

    expect(await caller.probes.cloudflareLocations()).toEqual([]);
  });
});
