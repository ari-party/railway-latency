import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
});

afterEach(() => vi.useRealTimers());

describe('per-probe token bucket', () => {
  it('admits up to the burst capacity then rejects', async () => {
    const { createRateLimiter } = await import('@/services/rateLimit');
    const limiter = createRateLimiter({ capacity: 10, refillPerSecond: 2 });

    for (let i = 0; i < 10; i += 1)
      expect(limiter.consume('asia-hcloud-sin1')).toBe(true);

    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);
  });

  it('keeps separate buckets per probe', async () => {
    const { createRateLimiter } = await import('@/services/rateLimit');
    const limiter = createRateLimiter({ capacity: 1, refillPerSecond: 2 });

    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);
    expect(limiter.consume('europe-ovh-fra1')).toBe(true);
  });

  it('refills over time', async () => {
    const { createRateLimiter } = await import('@/services/rateLimit');
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 2 });

    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);

    vi.advanceTimersByTime(1_000);

    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);
  });

  it('evicts buckets gone idle without losing throttle correctness', async () => {
    const { createRateLimiter } = await import('@/services/rateLimit');
    const limiter = createRateLimiter({ capacity: 2, refillPerSecond: 2 });

    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);

    vi.advanceTimersByTime(120_000);

    // A consume from another probe drives the idle sweep, evicting the first
    // probe's bucket; having fully refilled, it still gets its whole burst back.
    expect(limiter.consume('europe-ovh-fra1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);
  });

  it('does not evict a still-throttled bucket within the idle window', async () => {
    const { createRateLimiter } = await import('@/services/rateLimit');
    // Full refill takes 120s, so the eviction window is 120s while the sweep
    // runs every 60s: a sweep fires while a drained bucket is only half-refilled
    // and still inside its window, so it must survive (not reset to full).
    const limiter = createRateLimiter({ capacity: 120, refillPerSecond: 1 });

    for (let i = 0; i < 120; i += 1)
      expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);

    vi.advanceTimersByTime(60_000);

    // The other probe drives the sweep; asia is within its window so it keeps
    // its drained state and has refilled exactly 60 tokens, not a full 120.
    expect(limiter.consume('europe-ovh-fra1')).toBe(true);
    for (let i = 0; i < 60; i += 1)
      expect(limiter.consume('asia-hcloud-sin1')).toBe(true);
    expect(limiter.consume('asia-hcloud-sin1')).toBe(false);
  });
});
