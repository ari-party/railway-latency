import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const redisMock = { set: vi.fn(), eval: vi.fn() };
vi.mock('@/server/services/redis', () => ({ redis: redisMock }));

async function importQueue() {
  return import('./queue');
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('withRunLock', () => {
  it('runs fn and releases the lock when acquired', async () => {
    redisMock.set.mockResolvedValueOnce('OK');
    redisMock.eval.mockResolvedValue(1);
    const { withRunLock } = await importQueue();

    const value = await withRunLock(async () => 42);

    expect(value).toBe(42);
    expect(redisMock.set).toHaveBeenCalledWith(
      'globalping:lock',
      expect.any(String),
      'PX',
      60000,
      'NX',
    );
    expect(redisMock.eval).toHaveBeenCalledTimes(1);
  });

  it('retries until the lock frees', async () => {
    redisMock.set.mockResolvedValueOnce(null).mockResolvedValueOnce('OK');
    redisMock.eval.mockResolvedValue(1);
    const { withRunLock } = await importQueue();

    const value = await withRunLock(async () => 'done', {
      retryMs: 1,
      maxWaitMs: 1000,
    });
    expect(value).toBe('done');
    expect(redisMock.set).toHaveBeenCalledTimes(2);
  });

  it('throws TOO_MANY_REQUESTS when the queue wait is exceeded', async () => {
    redisMock.set.mockResolvedValue(null);
    const { withRunLock } = await importQueue();

    await expect(
      withRunLock(async () => 'never', { retryMs: 1, maxWaitMs: 5 }),
    ).rejects.toMatchObject({ code: 'TOO_MANY_REQUESTS' });
  });

  it('fails open (runs without a lock) on a redis error', async () => {
    redisMock.set.mockRejectedValueOnce(new Error('down'));
    const { withRunLock } = await importQueue();

    const value = await withRunLock(async () => 'ran');
    expect(value).toBe('ran');
    expect(redisMock.eval).not.toHaveBeenCalled();
  });
});
