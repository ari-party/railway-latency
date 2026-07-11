import { randomUUID } from 'node:crypto';

import { TRPCError } from '@trpc/server';

import { redis } from '@/server/services/redis';

const LOCK_KEY = 'globalping:lock';
const LOCK_TTL_MS = 60_000;

const RELEASE_SCRIPT =
  "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end";

const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export interface RunLockOptions {
  retryMs?: number;
  maxWaitMs?: number;
}

type Acquisition = 'locked' | 'busy' | 'skip';

async function acquire(
  token: string,
  retryMs: number,
  maxWaitMs: number,
): Promise<Acquisition> {
  const deadline = Date.now() + maxWaitMs;

  for (;;) {
    let ok: string | null;
    try {
      ok = await redis.set(LOCK_KEY, token, 'PX', LOCK_TTL_MS, 'NX');
    } catch {
      return 'skip';
    }

    if (ok) return 'locked';
    if (Date.now() >= deadline) return 'busy';

    await sleep(retryMs);
  }
}

export async function withRunLock<T>(
  fn: () => Promise<T>,
  options: RunLockOptions = {},
): Promise<T> {
  const retryMs = options.retryMs ?? 750;
  const maxWaitMs = options.maxWaitMs ?? 90_000;
  const token = randomUUID();

  const held = await acquire(token, retryMs, maxWaitMs);
  if (held === 'busy')
    throw new TRPCError({
      code: 'TOO_MANY_REQUESTS',
      message: 'A measurement is already running. Try again shortly.',
    });

  try {
    return await fn();
  } finally {
    if (held === 'locked') {
      try {
        await redis.eval(RELEASE_SCRIPT, 1, LOCK_KEY, token);
      } catch {
        // Best effort
      }
    }
  }
}
