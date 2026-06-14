import ky from 'ky';

import { env } from '@/env';

import type { Resolution, RosterProbe } from '@/types';

const FAIL_STATIC_MAX_MS = 5 * 60 * 1_000;
const ON_MISS_MIN_AGE_MS = 2 * 1_000;

type FetchRoster = () => Promise<RosterProbe[]>;

async function fetchRosterOverPrivateNetwork(): Promise<RosterProbe[]> {
  return ky
    .get('internal/roster', {
      prefixUrl: env.CONTROL_PLANE_URL,
      headers: { 'X-Internal-Token': env.CONTROL_PLANE_INTERNAL_TOKEN },
      timeout: 5 * 1_000,
    })
    .json<RosterProbe[]>();
}

export interface RosterCache {
  refresh(): Promise<void>;
  resolve(prefix: string): Promise<Resolution>;
}

export function createRoster(
  options: { fetchRoster?: FetchRoster } = {},
): RosterCache {
  const fetchRoster = options.fetchRoster ?? fetchRosterOverPrivateNetwork;

  let cache = new Map<string, RosterProbe>();
  let fetchedAt = 0;
  let lastGoodAt = 0;
  let inFlight: Promise<void> | undefined;

  async function fetchIntoCache(): Promise<void> {
    const probeList = await fetchRoster();
    const next = new Map<string, RosterProbe>();

    for (const probe of probeList) {
      next.set(probe.apiKeyPrefix, probe);
      if (probe.previousApiKeyPrefix)
        next.set(probe.previousApiKeyPrefix, probe);
    }

    cache = next;
    fetchedAt = Date.now();
    lastGoodAt = fetchedAt;
  }

  function refresh(): Promise<void> {
    if (inFlight) return inFlight;

    inFlight = fetchIntoCache().finally(() => {
      inFlight = undefined;
    });

    return inFlight;
  }

  async function resolve(prefix: string): Promise<Resolution> {
    if (Date.now() - fetchedAt > env.ROSTER_REFRESH_MS)
      refresh().catch(() => {});

    // Serve the last-good cache while the control plane is down, but fail closed once it is stale beyond the bound.
    if (lastGoodAt === 0) return { unavailable: true };
    if (Date.now() - lastGoodAt > FAIL_STATIC_MAX_MS)
      return { unavailable: true };

    const hit = cache.get(prefix);
    if (hit) return { probe: hit };

    // Refresh off the request path so an unknown prefix can't drive a synchronous control-plane fetch; a freshly-enrolled probe 401s once, then resolves.
    if (Date.now() - fetchedAt > ON_MISS_MIN_AGE_MS) refresh().catch(() => {});

    return { unknown: true };
  }

  return { refresh, resolve };
}
