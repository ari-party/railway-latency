import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProbeMetadata } from '@railway-latency/types';

const memoizeMock = vi.fn();
const getJsonMock = vi.fn();
const controlPlaneRef: { current: unknown } = { current: null };

vi.mock('@/server/utils/memoize', () => ({
  memoize: (key: string, fn: () => Promise<unknown>, ttl?: number) =>
    memoizeMock(key, fn, ttl),
}));

vi.mock('@/server/services/controlPlane', () => ({
  get controlPlane() {
    return controlPlaneRef.current;
  },
}));

async function makeCaller() {
  const { createCallerFactory, createTRPCRouter } = await import(
    '@/server/api/trpc/context'
  );
  const { probesRouter } = await import('@/server/api/trpc/routers/probes');
  const appRouter = createTRPCRouter({ probes: probesRouter });
  return createCallerFactory(appRouter)({});
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  controlPlaneRef.current = null;
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
