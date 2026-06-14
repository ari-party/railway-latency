import { hasDrift } from '@/lib/format';

import type { Probe } from '@railway-latency/types';

export interface ShaGroup {
  sha: string | null;
  count: number;
  isLatest: boolean;
  drifted: boolean;
}

export interface DriftSummary {
  groups: ShaGroup[];
  onLatest: number;
  behind: number;
  notDeployed: number;
}

export function summarizeDrift(
  probes: Probe[],
  latestSha: string | null,
): DriftSummary {
  const counts = new Map<string | null, number>();
  for (const probe of probes) {
    counts.set(probe.deployedSha, (counts.get(probe.deployedSha) ?? 0) + 1);
  }

  const groups: ShaGroup[] = [...counts.entries()]
    .map(([sha, count]) => ({
      sha,
      count,
      isLatest: latestSha !== null && sha === latestSha,
      drifted: hasDrift(sha, latestSha),
    }))
    .sort((first, second) => {
      if (first.isLatest !== second.isLatest) return first.isLatest ? -1 : 1;
      if (second.count !== first.count) return second.count - first.count;
      return (first.sha ?? '').localeCompare(second.sha ?? '');
    });

  let onLatest = 0;
  let behind = 0;
  let notDeployed = 0;
  for (const group of groups) {
    if (group.sha === null) notDeployed += group.count;
    else if (group.isLatest) onLatest += group.count;
    else behind += group.count;
  }

  return { groups, onLatest, behind, notDeployed };
}
