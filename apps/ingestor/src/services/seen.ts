import ky from 'ky';

import { env } from '@/env';
import { log } from '@/pino';

import type { SeenEntry } from '@railway-latency/types';

type PostSeen = (batch: SeenEntry[]) => Promise<void>;

async function postSeenToControlPlane(batch: SeenEntry[]): Promise<void> {
  await ky.post('internal/seen', {
    prefixUrl: env.CONTROL_PLANE_URL,
    headers: { 'X-Internal-Token': env.CONTROL_PLANE_INTERNAL_TOKEN },
    json: batch,
    timeout: 5 * 1_000,
  });
}

export interface SeenReporter {
  record(probeId: string): void;
  flush(): Promise<void>;
}

export function createSeenReporter(
  options: { postSeen?: PostSeen; debounceMs?: number } = {},
): SeenReporter {
  const postSeen = options.postSeen ?? postSeenToControlPlane;
  const debounceMs = options.debounceMs ?? 10 * 1_000;

  const pending = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): Promise<void> {
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    if (pending.size === 0) return Promise.resolve();

    const batch: SeenEntry[] = [...pending.entries()].map(([probeId, ts]) => ({
      probeId,
      ts,
    }));

    pending.clear();

    return postSeen(batch).catch((error) =>
      log.error({ name: 'seen', err: error }, 'Failed to post liveness batch'),
    );
  }

  function record(probeId: string) {
    pending.set(probeId, Date.now());
    if (timer === undefined) timer = setTimeout(flush, debounceMs);
  }

  return { record, flush };
}
