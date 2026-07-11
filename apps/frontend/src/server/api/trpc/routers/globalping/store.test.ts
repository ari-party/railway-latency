import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { GlobalpingResult } from './types';

const redisMock = {
  set: vi.fn(),
  get: vi.fn(),
  zadd: vi.fn(),
  zrevrange: vi.fn(),
  zremrangebyscore: vi.fn(),
  zrem: vi.fn(),
  mget: vi.fn(),
};

vi.mock('@/server/services/redis', () => ({ redis: redisMock }));

async function importStore() {
  return import('./store');
}

function result(id: string, createdAt: number): GlobalpingResult {
  return {
    id,
    type: 'http',
    dst: 'us-east4-eqdc4a',
    target: 'us-east4-eqdc4a-echo.up.railway.app',
    location: { country: 'DE' },
    createdAt,
    probes: [],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storeResult', () => {
  it('writes the result with a 24h TTL and indexes it by createdAt', async () => {
    const { storeResult } = await importStore();
    await storeResult(result('m1', 1000));

    expect(redisMock.set).toHaveBeenCalledWith(
      'globalping:result:m1',
      expect.any(String),
      'EX',
      86400,
    );
    expect(redisMock.zadd).toHaveBeenCalledWith('globalping:index', 1000, 'm1');
  });

  it('swallows redis errors', async () => {
    redisMock.set.mockRejectedValueOnce(new Error('down'));
    const { storeResult } = await importStore();
    await expect(storeResult(result('m1', 1000))).resolves.toBeUndefined();
  });
});

describe('getResult', () => {
  it('parses the stored JSON', async () => {
    redisMock.get.mockResolvedValueOnce(JSON.stringify(result('m1', 1000)));
    const { getResult } = await importStore();
    expect((await getResult('m1'))?.id).toBe('m1');
  });

  it('returns null when missing', async () => {
    redisMock.get.mockResolvedValueOnce(null);
    const { getResult } = await importStore();
    expect(await getResult('m1')).toBeNull();
  });
});

describe('listRecent', () => {
  it('prunes stale ids and returns summaries newest-first', async () => {
    redisMock.zremrangebyscore.mockResolvedValue(0);
    redisMock.zrevrange.mockResolvedValue(['m2', 'gone']);
    redisMock.mget.mockResolvedValue([
      JSON.stringify(result('m2', 2000)),
      null,
    ]);
    const { listRecent } = await importStore();
    const summaries = await listRecent();

    expect(summaries).toEqual([
      {
        id: 'm2',
        type: 'http',
        dst: 'us-east4-eqdc4a',
        location: { country: 'DE' },
        probeCount: 0,
        createdAt: 2000,
      },
    ]);
    expect(redisMock.zrem).toHaveBeenCalledWith('globalping:index', 'gone');
  });

  it('returns [] on redis error', async () => {
    redisMock.zremrangebyscore.mockRejectedValueOnce(new Error('down'));
    const { listRecent } = await importStore();
    expect(await listRecent()).toEqual([]);
  });
});
