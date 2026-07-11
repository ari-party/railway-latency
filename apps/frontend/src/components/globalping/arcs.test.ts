import { describe, expect, it } from 'vitest';

import { hitPopIds, probePopArcs, spreadProbes } from './arcs';

import type { RailwayPop } from '@/components/fleet/usePops';
import type { GlobalpingProbeResult } from '@/server/api/trpc/routers/globalping/types';

const pops: RailwayPop[] = [
  {
    id: 'fra1',
    name: 'Frankfurt',
    region: 'fra',
    status: 'available',
    geo: { lat: 50, lon: 8 },
  },
  {
    id: 'iad1',
    name: 'Ashburn',
    region: 'iad',
    status: 'available',
    geo: { lat: 39, lon: -77 },
  },
];

function probe(hikariPop: string | null): GlobalpingProbeResult {
  return {
    probe: {
      continent: 'EU',
      region: 'r',
      country: 'DE',
      state: null,
      city: 'Berlin',
      asn: 1,
      network: 'n',
      lat: 52.5,
      lon: 13.4,
    },
    status: 'finished',
    hikariPop,
  };
}

describe('probePopArcs', () => {
  it('builds one arc per probe that matched a pop', () => {
    const fc = probePopArcs([probe('fra1'), probe(null), probe('zzz9')], pops);
    expect(fc.features).toHaveLength(1);
    expect(fc.features[0].properties.hikariPop).toBe('fra1');
    const coords = fc.features[0].geometry.coordinates;
    expect(coords[0][0]).toBeCloseTo(13.4, 5);
    expect(coords[0][1]).toBeCloseTo(52.5, 5);
    expect(coords[coords.length - 1][0]).toBeCloseTo(8, 5);
    expect(coords[coords.length - 1][1]).toBeCloseTo(50, 5);
  });
});

describe('spreadProbes', () => {
  it('leaves a lone probe at its coordinates', () => {
    const [only] = spreadProbes([probe('fra1')]);
    expect(only.probe.lat).toBe(52.5);
    expect(only.probe.lon).toBe(13.4);
  });

  it('separates probes that share identical coordinates', () => {
    const out = spreadProbes([probe('fra1'), probe('fra1'), probe('fra1')]);
    const coords = out.map((entry) => `${entry.probe.lat},${entry.probe.lon}`);
    expect(new Set(coords).size).toBe(3);

    for (const entry of out) {
      expect(Math.abs(entry.probe.lat - 52.5)).toBeLessThan(1);
      expect(Math.abs(entry.probe.lon - 13.4)).toBeLessThan(1);
    }
  });
});

describe('hitPopIds', () => {
  it('returns the set of matched pop ids', () => {
    expect(
      [...hitPopIds([probe('fra1'), probe('iad1'), probe(null)], pops)].sort(),
    ).toEqual(['fra1', 'iad1']);
  });
});
