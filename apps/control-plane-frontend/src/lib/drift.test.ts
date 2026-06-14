import { describe, expect, it } from 'vitest';

import { summarizeDrift } from '@/lib/drift';

import type { Probe } from '@railway-latency/types';

function probe(deployedSha: string | null): Probe {
  return {
    probeId: 'p',
    lat: 0,
    lon: 0,
    status: 'active',
    deployedSha,
    host: 'p.example.com',
    lastSeen: null,
  };
}

describe('summarizeDrift', () => {
  it('groups by sha and tallies on-latest, behind and not-deployed', () => {
    const summary = summarizeDrift(
      [probe('latest1'), probe('latest1'), probe('older22'), probe(null)],
      'latest1',
    );

    expect(summary.onLatest).toBe(2);
    expect(summary.behind).toBe(1);
    expect(summary.notDeployed).toBe(1);
  });

  it('orders the latest group first, then by descending count', () => {
    const summary = summarizeDrift(
      [probe('older22'), probe('older22'), probe('older22'), probe('latest1')],
      'latest1',
    );

    expect(summary.groups[0]).toMatchObject({ sha: 'latest1', isLatest: true });
    expect(summary.groups[1]).toMatchObject({ sha: 'older22', count: 3 });
  });

  it('marks only differing known shas as drifted', () => {
    const summary = summarizeDrift([probe('older22'), probe(null)], 'latest1');
    const older = summary.groups.find((group) => group.sha === 'older22');
    const none = summary.groups.find((group) => group.sha === null);

    expect(older?.drifted).toBe(true);
    expect(none?.drifted).toBe(false);
  });

  it('flags nothing as drifted when the latest sha is unknown', () => {
    const summary = summarizeDrift([probe('older22')], null);
    expect(summary.behind).toBe(1);
    expect(summary.groups[0].drifted).toBe(false);
  });
});
