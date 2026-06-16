import { describe, expect, it } from 'vitest';

import { filterProbes, groupProbes, probeGroupKey } from '@/utils/probeList';

import type { ProbeMetadata } from '@railway-latency/types';

const probe = (probeId: string): ProbeMetadata => ({
  probeId,
  lat: 0,
  lon: 0,
  status: 'green',
});

describe('probeGroupKey', () => {
  it('uses the leading id segment', () => {
    expect(probeGroupKey('asia-hcloud-sin1')).toBe('asia');
    expect(probeGroupKey('solo')).toBe('solo');
  });
});

describe('filterProbes', () => {
  const probes = [probe('asia-hcloud-sin1'), probe('eu-hetzner-fra1')];

  it('returns all probes for an empty query', () => {
    expect(filterProbes(probes, '')).toHaveLength(2);
  });

  it('matches case-insensitively on the probe id', () => {
    expect(filterProbes(probes, 'FRA')).toEqual([probe('eu-hetzner-fra1')]);
  });
});

describe('groupProbes', () => {
  it('groups by leading segment, sorted, with sorted members', () => {
    const probes = [
      probe('eu-hetzner-fra1'),
      probe('asia-hcloud-sin1'),
      probe('asia-hcloud-nrt1'),
    ];

    expect(groupProbes(probes)).toEqual([
      {
        group: 'asia',
        probes: [probe('asia-hcloud-nrt1'), probe('asia-hcloud-sin1')],
      },
      { group: 'eu', probes: [probe('eu-hetzner-fra1')] },
    ]);
  });
});
