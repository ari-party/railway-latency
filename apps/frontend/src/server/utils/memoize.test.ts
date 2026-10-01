import { beforeEach, describe, expect, it, vi } from 'vitest';

const redis = vi.hoisted(() => ({
  ttl: vi.fn(async () => -2),
  get: vi.fn(async () => null),
  setex: vi.fn(async () => 'OK'),
}));

vi.mock('@/env', () => ({ env: { NODE_ENV: 'test' } }));
vi.mock('@/server/services/redis', () => ({ redis }));

import { memoize } from '@/server/utils/memoize';

describe('memoize', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('caches a resolved value', async () => {
    expect(await memoize('ok', async () => [1, 2], 60)).toEqual([1, 2]);
    expect(redis.setex).toHaveBeenCalledWith(
      'memoize:ok',
      60,
      JSON.stringify({ value: [1, 2] }),
    );
  });

  it('does not cache a null failure result', async () => {
    expect(await memoize('failed', async () => null, 60)).toBeNull();
    expect(redis.setex).not.toHaveBeenCalled();
  });
});
