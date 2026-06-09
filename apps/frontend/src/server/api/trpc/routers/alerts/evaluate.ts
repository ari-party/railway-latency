import {
  ceilingFor,
  EXPECTED_CF_POP,
  EXPECTED_HIKARI_POP,
  MEASUREMENT_NETWORK,
  normalizeHikariPop,
  ROUTING_ACTIVE_MS,
  severityFor,
} from './config';

import type { Alert, AlertKind, RoutingSnapshotRow, Snapshot } from './config';

const FIELD_KIND: Record<string, Exclude<AlertKind, 'latency'>> = {
  railway_edge: 'edge',
  cf_pop: 'cfPop',
  hikari_pop: 'hikariPop',
};

function expectedFor(
  kind: Exclude<AlertKind, 'latency'>,
  src: string,
  dst: string,
): string | string[] | null {
  if (kind === 'edge') return `railway/${dst}`;
  if (kind === 'cfPop') return EXPECTED_CF_POP[src] ?? null;
  return EXPECTED_HIKARI_POP[src] ?? null;
}

function isMisrouted(
  row: RoutingSnapshotRow,
  kind: Exclude<AlertKind, 'latency'>,
  expected: string | string[],
): boolean {
  if (kind === 'edge') return row.value !== expected;
  const observed =
    kind === 'hikariPop' ? normalizeHikariPop(row.value) : row.value;
  return !(expected as string[]).includes(observed);
}

function latencyAlerts(snapshot: Snapshot): Alert[] {
  const alerts: Alert[] = [];

  for (const row of snapshot.latency) {
    const network = MEASUREMENT_NETWORK[row.measurement];
    if (!network) continue;

    const ceiling = ceilingFor(row.src, row.dst, network);
    if (ceiling == null || row.median <= ceiling) continue;

    alerts.push({
      kind: 'latency',
      severity: severityFor(row.median - ceiling),
      src: row.src,
      dst: row.dst,
      network,
      current: row.median,
      limit: ceiling,
    });
  }

  return alerts;
}

function inversionAlerts(snapshot: Snapshot): Alert[] {
  const byPair = new Map<string, { private?: number; public?: number }>();

  for (const row of snapshot.latency) {
    const network = MEASUREMENT_NETWORK[row.measurement];
    if (network !== 'private' && network !== 'public') continue;

    const key = `${row.src}|${row.dst}`;
    const entry = byPair.get(key) ?? {};
    entry[network] = row.median;
    byPair.set(key, entry);
  }

  const alerts: Alert[] = [];
  for (const [key, { private: priv, public: pub }] of byPair) {
    if (priv == null || pub == null || pub >= priv) continue;

    const [src, dst] = key.split('|');
    alerts.push({
      kind: 'inversion',
      severity: 'warning',
      src,
      dst,
      network: 'public',
      current: pub,
      limit: priv,
    });
  }

  return alerts;
}

interface RoutingAccumulator {
  kind: Exclude<AlertKind, 'latency'>;
  src: string;
  dst: string;
  network: Alert['network'];
  expected: string | string[];
  observed: Set<string>;
  count: number;
  firstTime: string;
  lastTime: string;
}

function routingAlerts(snapshot: Snapshot, now: number): Alert[] {
  const groups = new Map<string, RoutingAccumulator>();

  for (const row of snapshot.routing) {
    const network = MEASUREMENT_NETWORK[row.measurement];
    const kind = FIELD_KIND[row.field];
    if (!network || !kind) continue;

    const expected = expectedFor(kind, row.src, row.dst);
    if (expected == null) continue;
    if (!isMisrouted(row, kind, expected)) continue;

    const key = `${row.src}|${row.dst}|${kind}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, {
        kind,
        src: row.src,
        dst: row.dst,
        network,
        expected,
        observed: new Set([row.value]),
        count: row.count,
        firstTime: row.firstTime,
        lastTime: row.lastTime,
      });
      continue;
    }

    group.observed.add(row.value);
    group.count += row.count;
    if (row.firstTime < group.firstTime) group.firstTime = row.firstTime;
    if (row.lastTime > group.lastTime) group.lastTime = row.lastTime;
  }

  return [...groups.values()].map((group) => ({
    kind: group.kind,
    severity:
      now - new Date(group.lastTime).getTime() <= ROUTING_ACTIVE_MS
        ? 'critical'
        : 'warning',
    src: group.src,
    dst: group.dst,
    network: group.network,
    observed: [...group.observed].join(', '),
    expected: group.expected,
    count: group.count,
    firstTime: group.firstTime,
    lastTime: group.lastTime,
  }));
}

export function evaluate(snapshot: Snapshot, now: number): Alert[] {
  return [
    ...latencyAlerts(snapshot),
    ...inversionAlerts(snapshot),
    ...routingAlerts(snapshot, now),
  ];
}
