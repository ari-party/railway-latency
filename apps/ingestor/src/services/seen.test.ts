import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SeenEntry } from '@railway-latency/types';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  process.env.CONTROL_PLANE_URL = 'http://cp:3000';
  process.env.CONTROL_PLANE_INTERNAL_TOKEN = 'test-internal-token';
  process.env.CLICKHOUSE_URL = 'http://ch:8123';
  process.env.CLICKHOUSE_USERNAME = 'default';
  process.env.CLICKHOUSE_PASSWORD = 'x';
  process.env.CLICKHOUSE_DATABASE = 'latency';
});

afterEach(() => vi.useRealTimers());

describe('seen heartbeat', () => {
  it('batches per-probe heartbeats and flushes once after the debounce window', async () => {
    const postSeen = vi.fn(async (_batch: SeenEntry[]) => {});
    const { createSeenReporter } = await import('@/services/seen');
    const reporter = createSeenReporter({ postSeen, debounceMs: 10_000 });

    vi.setSystemTime(1_000);
    reporter.record('asia-hcloud-sin1');
    vi.setSystemTime(2_000);
    reporter.record('europe-ovh-fra1');
    vi.setSystemTime(3_000);
    reporter.record('asia-hcloud-sin1');

    expect(postSeen).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_000);
    await Promise.resolve();

    expect(postSeen).toHaveBeenCalledOnce();
    const [batch] = postSeen.mock.calls[0];
    expect(batch).toEqual(
      expect.arrayContaining([
        { probeId: 'asia-hcloud-sin1', ts: 3_000 },
        { probeId: 'europe-ovh-fra1', ts: 2_000 },
      ]),
    );
    expect(batch).toHaveLength(2);
  });

  it('flushes pending heartbeats immediately and cancels the debounce timer', async () => {
    const postSeen = vi.fn(async (_batch: SeenEntry[]) => {});
    const { createSeenReporter } = await import('@/services/seen');
    const reporter = createSeenReporter({ postSeen, debounceMs: 10_000 });

    vi.setSystemTime(1_000);
    reporter.record('asia-hcloud-sin1');

    reporter.flush();
    await Promise.resolve();

    expect(postSeen).toHaveBeenCalledOnce();
    expect(postSeen.mock.calls[0][0]).toEqual([
      { probeId: 'asia-hcloud-sin1', ts: 1_000 },
    ]);

    vi.advanceTimersByTime(30_000);
    await Promise.resolve();

    expect(postSeen).toHaveBeenCalledOnce();
  });

  it('does not flush when there is nothing pending', async () => {
    const postSeen = vi.fn(async (_batch: SeenEntry[]) => {});
    const { createSeenReporter } = await import('@/services/seen');
    createSeenReporter({ postSeen, debounceMs: 10_000 });

    vi.advanceTimersByTime(30_000);
    await Promise.resolve();

    expect(postSeen).not.toHaveBeenCalled();
  });
});
