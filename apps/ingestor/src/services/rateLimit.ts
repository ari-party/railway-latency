interface Bucket {
  tokens: number;
  lastRefilledAt: number;
}

export interface RateLimiter {
  consume(probeId: string): boolean;
}

const MIN_IDLE_EVICTION_MS = 60 * 1_000;
const SWEEP_INTERVAL_MS = 60 * 1_000;

export function createRateLimiter(options: {
  capacity: number;
  refillPerSecond: number;
}): RateLimiter {
  const { capacity, refillPerSecond } = options;

  // Past this idle point a bucket has fully refilled, so evicting it is lossless: a missing bucket reconstructs at capacity.
  const idleEvictionMs = Math.max(
    MIN_IDLE_EVICTION_MS,
    (capacity / refillPerSecond) * 1_000,
  );

  const buckets = new Map<string, Bucket>();
  let lastSweptAt = 0;

  function evictIdleBuckets(now: number): void {
    if (now - lastSweptAt < SWEEP_INTERVAL_MS) return;
    lastSweptAt = now;
    for (const [probeId, bucket] of buckets) {
      if (now - bucket.lastRefilledAt > idleEvictionMs) buckets.delete(probeId);
    }
  }

  function consume(probeId: string): boolean {
    const now = Date.now();
    evictIdleBuckets(now);

    const bucket = buckets.get(probeId) ?? {
      tokens: capacity,
      lastRefilledAt: now,
    };

    const elapsedSeconds = (now - bucket.lastRefilledAt) / 1_000;
    bucket.tokens = Math.min(
      capacity,
      bucket.tokens + elapsedSeconds * refillPerSecond,
    );
    bucket.lastRefilledAt = now;

    let admitted = false;
    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      admitted = true;
    }

    buckets.set(probeId, bucket);
    return admitted;
  }

  return { consume };
}
