import type { ProbeMetadata } from '@railway-latency/types';

export function probeGroupKey(probeId: string): string {
  return probeId.split('-')[0];
}

export function filterProbes(
  probes: readonly ProbeMetadata[],
  query: string,
): ProbeMetadata[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...probes];
  return probes.filter((probe) => probe.probeId.toLowerCase().includes(needle));
}

export interface ProbeGroup {
  group: string;
  probes: ProbeMetadata[];
}

export function groupProbes(probes: readonly ProbeMetadata[]): ProbeGroup[] {
  const byGroup = new Map<string, ProbeMetadata[]>();
  for (const probe of probes) {
    const key = probeGroupKey(probe.probeId);
    const list = byGroup.get(key) ?? [];
    list.push(probe);
    byGroup.set(key, list);
  }

  return [...byGroup.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, list]) => ({
      group,
      probes: list.sort((a, b) => a.probeId.localeCompare(b.probeId)),
    }));
}
