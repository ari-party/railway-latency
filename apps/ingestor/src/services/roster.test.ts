import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { RosterProbe } from '@/types';

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  process.env.INFLUXDB_URL = 'http://influx:8086';
  process.env.INFLUXDB_TOKEN = 'write-only-token';
  process.env.INFLUXDB_ORG = 'railway';
  process.env.INFLUXDB_BUCKET = 'latency';
  process.env.CONTROL_PLANE_URL = 'http://control-plane.railway.internal:3000';
  process.env.CONTROL_PLANE_INTERNAL_TOKEN = 'test-internal-token';
  process.env.ROSTER_REFRESH_MS = '45000';
  process.env.CLICKHOUSE_URL = 'http://ch:8123';
  process.env.CLICKHOUSE_USERNAME = 'default';
  process.env.CLICKHOUSE_PASSWORD = 'x';
  process.env.CLICKHOUSE_DATABASE = 'latency';
});

afterEach(() => {
  vi.useRealTimers();
  delete process.env.ROSTER_REFRESH_MS;
});

const probe: RosterProbe = {
  probeId: 'asia-hcloud-sin1',
  apiKeyPrefix: 'rl_asia-hcloud-sin1_abcd1234',
  apiKeyHash: 'deadbeef',
  lat: 1.29,
  lon: 103.85,
  status: 'active',
};

describe('roster cache', () => {
  it('returns unavailable before the first successful refresh', async () => {
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({ fetchRoster: async () => [probe] });

    expect(await roster.resolve('rl_asia-hcloud-sin1_abcd1234')).toEqual({
      unavailable: true,
    });
  });

  it('resolves a known prefix after a refresh', async () => {
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({ fetchRoster: async () => [probe] });

    await roster.refresh();

    expect(await roster.resolve('rl_asia-hcloud-sin1_abcd1234')).toEqual({
      probe,
    });
  });

  it('returns unknown for an absent prefix when the roster is fresh', async () => {
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({ fetchRoster: async () => [probe] });

    await roster.refresh();

    expect(await roster.resolve('rl_unknown_00000000')).toEqual({
      unknown: true,
    });
  });

  it('returns unknown immediately on a miss and refreshes in the background, not synchronously', async () => {
    let calls = 0;
    let releaseSecondFetch: (probes: RosterProbe[]) => void = () => {};
    const newProbe: RosterProbe = {
      ...probe,
      probeId: 'europe-ovh-fra1',
      apiKeyPrefix: 'rl_europe-ovh-fra1_99887766',
    };

    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({
      fetchRoster: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve([probe]);
        return new Promise<RosterProbe[]>((resolve) => {
          releaseSecondFetch = resolve;
        });
      },
    });

    await roster.refresh();
    // Age the cache past the on-miss floor (2s) but within the fail-static window.
    vi.advanceTimersByTime(3 * 1_000);

    // The miss returns unknown without awaiting the background refetch.
    expect(await roster.resolve('rl_europe-ovh-fra1_99887766')).toEqual({
      unknown: true,
    });
    expect(calls).toBe(2);

    // Once the background refresh lands, a retry resolves the newly-enrolled probe.
    releaseSecondFetch([probe, newProbe]);
    await Promise.resolve();
    await Promise.resolve();

    expect(await roster.resolve('rl_europe-ovh-fra1_99887766')).toEqual({
      probe: newProbe,
    });
  });

  it('keeps serving the last good cache when a refresh fails (fail-static)', async () => {
    let calls = 0;
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({
      fetchRoster: async () => {
        calls += 1;
        if (calls === 1) return [probe];
        throw new Error('control plane unreachable');
      },
    });

    await roster.refresh();
    await roster.refresh().catch(() => {});

    expect(await roster.resolve('rl_asia-hcloud-sin1_abcd1234')).toEqual({
      probe,
    });
  });

  it('fails closed (unavailable) after 5 minutes of stale cache', async () => {
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({ fetchRoster: async () => [probe] });

    await roster.refresh();
    vi.advanceTimersByTime(300_001);

    expect(await roster.resolve('rl_asia-hcloud-sin1_abcd1234')).toEqual({
      unavailable: true,
    });
  });

  it('coalesces concurrent refreshes into a single in-flight fetch', async () => {
    let calls = 0;
    let releaseFetch: (probes: RosterProbe[]) => void = () => {};
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({
      fetchRoster: () => {
        calls += 1;
        return new Promise<RosterProbe[]>((resolve) => {
          releaseFetch = resolve;
        });
      },
    });

    const first = roster.refresh();
    const second = roster.refresh();
    const third = roster.refresh();

    expect(calls).toBe(1);

    releaseFetch([probe]);
    await Promise.all([first, second, third]);

    expect(calls).toBe(1);

    const next = roster.refresh();
    expect(calls).toBe(2);

    releaseFetch([probe]);
    await next;
  });

  it('clears the in-flight refresh after a failure so the next refresh retries', async () => {
    let calls = 0;
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({
      fetchRoster: async () => {
        calls += 1;
        if (calls === 1) throw new Error('control plane unreachable');
        return [probe];
      },
    });

    await roster.refresh().catch(() => {});
    await roster.refresh();

    expect(calls).toBe(2);
    expect(await roster.resolve('rl_asia-hcloud-sin1_abcd1234')).toEqual({
      probe,
    });
  });

  it('resolves a rotation previous-prefix to the same probe', async () => {
    const rotating: RosterProbe = {
      ...probe,
      previousApiKeyPrefix: 'rl_asia-hcloud-sin1_old00000',
      previousApiKeyHash: 'cafef00d',
    };
    const { createRoster } = await import('@/services/roster');
    const roster = createRoster({ fetchRoster: async () => [rotating] });

    await roster.refresh();

    expect(await roster.resolve('rl_asia-hcloud-sin1_old00000')).toEqual({
      probe: rotating,
    });
  });
});
