import { redis } from '@/server/services/redis';

import type { GlobalpingResult, GlobalpingSummary } from './types';

const RESULT_PREFIX = 'globalping:result:';
const INDEX_KEY = 'globalping:index';
const TTL_SECONDS = 24 * 60 * 60;
const MAX_RECENT = 50;

export async function storeResult(result: GlobalpingResult): Promise<void> {
  try {
    await redis.set(
      RESULT_PREFIX + result.id,
      JSON.stringify(result),
      'EX',
      TTL_SECONDS,
    );
    await redis.zadd(INDEX_KEY, result.createdAt, result.id);
  } catch {
    // Best effort
  }
}

export async function getResult(id: string): Promise<GlobalpingResult | null> {
  try {
    const raw = await redis.get(RESULT_PREFIX + id);
    return raw ? (JSON.parse(raw) as GlobalpingResult) : null;
  } catch {
    return null;
  }
}

export async function listRecent(): Promise<GlobalpingSummary[]> {
  try {
    const cutoff = Date.now() - TTL_SECONDS * 1_000;
    await redis.zremrangebyscore(INDEX_KEY, 0, cutoff);
    const ids = await redis.zrevrange(INDEX_KEY, 0, MAX_RECENT - 1);
    if (ids.length === 0) return [];

    const raws = await redis.mget(
      ...ids.map((id: string) => RESULT_PREFIX + id),
    );
    const summaries: GlobalpingSummary[] = [];
    const stale: string[] = [];

    ids.forEach((id: string, index: number) => {
      const raw = raws[index];
      if (!raw) {
        stale.push(id);
        return;
      }

      const result = JSON.parse(raw) as GlobalpingResult;
      summaries.push({
        id: result.id,
        type: result.type,
        dst: result.dst,
        location: result.location,
        probeCount: result.probes.length,
        createdAt: result.createdAt,
      });
    });

    if (stale.length > 0) await redis.zrem(INDEX_KEY, ...stale);
    return summaries;
  } catch {
    return [];
  }
}
