import type { Network } from '@railway-latency/types';

export type Severity = 'warning' | 'high' | 'critical';

export type AlertKind =
  | 'latency'
  | 'inversion'
  | 'edge'
  | 'cfPop'
  | 'hikariPop';

export interface Alert {
  kind: AlertKind;
  severity: Severity;
  src: string;
  dst: string;
  network: Network;
  current?: number;
  limit?: number;
  observed?: string;
  expected?: string | string[];
  count?: number;
  firstTime?: string;
  lastTime?: string;
}

export interface LatencySnapshotRow {
  src: string;
  dst: string;
  measurement: string;
  median: number;
}

export interface RoutingSnapshotRow {
  src: string;
  dst: string;
  measurement: string;
  field: string;
  value: string;
  count: number;
  firstTime: string;
  lastTime: string;
}

export interface Snapshot {
  latency: LatencySnapshotRow[];
  routing: RoutingSnapshotRow[];
}

export const MEASUREMENT_NETWORK: Record<string, Network> = {
  http: 'private',
  httpPublicHikari: 'public',
  httpProxiedHikari: 'proxied',
};

export const SNAPSHOT_WINDOW = '15s';
export const SNAPSHOT_LOOKBACK = '1h';

// Cross-region proxied ceiling when not set explicitly, derived from public.
export const PROXIED_OVER_PUBLIC_MS = 50;

type NetworkCeilings = Record<Network, number>;

interface CeilingConfig {
  sameRegion: NetworkCeilings;
  // Undirected region pairs; either key order resolves.
  paths: Record<string, Partial<NetworkCeilings>>;
  severities: { name: Severity; overMs: number }[];
}

export const LATENCY_CEILINGS: CeilingConfig = {
  sameRegion: { private: 5, public: 10, proxied: 50 },
  paths: {
    'us-east4-eqdc4a<->us-west2': { private: 95, public: 100 },
    'us-east4-eqdc4a<->europe-west4-drams3a': { private: 105, public: 115 },
    'us-east4-eqdc4a<->asia-southeast1-eqsg3a': { private: 255, public: 255 },
    'us-west2<->europe-west4-drams3a': { private: 175, public: 165 },
    'us-west2<->asia-southeast1-eqsg3a': { private: 190, public: 200 },
    'europe-west4-drams3a<->asia-southeast1-eqsg3a': {
      private: 180,
      public: 195,
    },
  },
  severities: [
    { name: 'critical', overMs: 500 },
    { name: 'high', overMs: 100 },
    { name: 'warning', overMs: 0 },
  ],
};

export const EXPECTED_CF_POP: Record<string, string[]> = {
  'us-west2': ['LAX', 'SJC'],
  'us-east4-eqdc4a': ['IAD'],
  'europe-west4-drams3a': ['AMS'],
  'asia-southeast1-eqsg3a': ['SIN'],
};

export const EXPECTED_HIKARI_POP: Record<string, string[]> = {
  'us-west2': ['lax', 'sjc'],
  'us-east4-eqdc4a': ['iad'],
  'europe-west4-drams3a': ['ams'],
  'asia-southeast1-eqsg3a': ['sin'],
};

export function ceilingFor(
  src: string,
  dst: string,
  network: Network,
): number | null {
  if (src === dst) return LATENCY_CEILINGS.sameRegion[network];
  const path =
    LATENCY_CEILINGS.paths[`${src}<->${dst}`] ??
    LATENCY_CEILINGS.paths[`${dst}<->${src}`];
  if (!path) return null;

  if (path[network] != null) return path[network];
  // Proxied isn't measured separately cross-region; budget it over public.
  if (network === 'proxied' && path.public != null)
    return path.public + PROXIED_OVER_PUBLIC_MS;
  return null;
}

export function severityFor(overMs: number): Severity {
  const tier = LATENCY_CEILINGS.severities.find((t) => overMs >= t.overMs);
  return tier?.name ?? 'warning';
}

// The router id and varying suffix digit aren't stable, so match on the base.
export function normalizeHikariPop(code: string): string {
  return code.replace(/\d+$/, '');
}
