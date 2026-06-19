import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterCache } from '@/services/roster';
import type { RosterProbe } from '@/types';

beforeEach(() => {
  vi.resetModules();
  process.env.CONTROL_PLANE_URL = 'http://cp:3000';
  process.env.CONTROL_PLANE_INTERNAL_TOKEN = 'test-internal-token';
});

afterEach(() => vi.restoreAllMocks());

const probeId = 'asia-hcloud-sin1';
const random = 'abcd1234zzzz';
const token = `rl_${probeId}_${random}`;
const prefix = `rl_${probeId}_${random.slice(0, 8)}`;
const hash = createHash('sha256').update(token).digest('hex');

function baseProbe(overrides: Partial<RosterProbe> = {}): RosterProbe {
  return {
    probeId,
    apiKeyPrefix: prefix,
    apiKeyHash: hash,
    lat: 1.29,
    lon: 103.85,
    status: 'active',
    ...overrides,
  };
}

function fakeResponse() {
  const response: { statusCode?: number; body?: unknown } = {};
  return {
    status(code: number) {
      response.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      response.body = payload;
      return this;
    },
    captured: response,
  };
}

function fakeRequest(authorization?: string) {
  return {
    get(name: string) {
      if (name.toLowerCase() === 'authorization') return authorization;
      return undefined;
    },
  };
}

function stubRoster(
  resolution: Awaited<ReturnType<RosterCache['resolve']>>,
): RosterCache {
  return {
    refresh: async () => {},
    resolve: async () => resolution,
  };
}

describe('requireProbeAuth', () => {
  it('401s when the token is missing', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const middleware = requireProbeAuth(stubRoster({ unknown: true }));
    const request = fakeRequest(undefined);
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(response.captured.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('503s when the roster is unavailable (retryable)', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const middleware = requireProbeAuth(stubRoster({ unavailable: true }));
    const request = fakeRequest(`Bearer ${token}`);
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(response.captured.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it('401s when the roster is fresh but the prefix is unknown', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const middleware = requireProbeAuth(stubRoster({ unknown: true }));
    const request = fakeRequest(`Bearer ${token}`);
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(response.captured.statusCode).toBe(401);
  });

  it('401s when the hash does not match', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const middleware = requireProbeAuth(
      stubRoster({ probe: baseProbe({ apiKeyHash: 'f'.repeat(64) }) }),
    );
    const request = fakeRequest(`Bearer ${token}`);
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(response.captured.statusCode).toBe(401);
  });

  it('401s a revoked probe (hash kept for positive poisoning)', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const middleware = requireProbeAuth(
      stubRoster({ probe: baseProbe({ status: 'revoked' }) }),
    );
    const request = fakeRequest(`Bearer ${token}`);
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(response.captured.statusCode).toBe(401);
  });

  it('403s a disabled probe', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const middleware = requireProbeAuth(
      stubRoster({ probe: baseProbe({ status: 'disabled' }) }),
    );
    const request = fakeRequest(`Bearer ${token}`);
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(response.captured.statusCode).toBe(403);
  });

  it('calls next and binds request.probe on a valid token', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const probe = baseProbe();
    const middleware = requireProbeAuth(stubRoster({ probe }));
    const request: { probe?: RosterProbe } & ReturnType<typeof fakeRequest> = {
      ...fakeRequest(`Bearer ${token}`),
    };
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(request.probe).toEqual(probe);
  });

  it('accepts the previous hash during a rotation handoff', async () => {
    const { requireProbeAuth } = await import('@/middleware/probeAuth');
    const probe = baseProbe({
      apiKeyHash: 'a'.repeat(64),
      previousApiKeyHash: hash,
    });
    const middleware = requireProbeAuth(stubRoster({ probe }));
    const request: { probe?: RosterProbe } & ReturnType<typeof fakeRequest> = {
      ...fakeRequest(`Bearer ${token}`),
    };
    const response = fakeResponse();
    const next = vi.fn();

    await middleware(request as never, response as never, next);

    expect(next).toHaveBeenCalledOnce();
    expect(request.probe).toEqual(probe);
  });
});
