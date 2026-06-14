import { describe, expect, it } from 'vitest';

import {
  railwayMarkersFromRegions,
  statusColorFor,
} from '@/components/probeMap';

import type { StatusPalette } from '@/components/probeMap';
import type { ProbeStatus } from '@railway-latency/types';

describe('statusColorFor', () => {
  const palette: StatusPalette = {
    green: '#0f0',
    stale: '#fa0',
    down: '#f00',
    inactive: '#888',
  };

  it('maps each probe status to its palette color', () => {
    const cases: [ProbeStatus, string][] = [
      ['green', palette.green],
      ['stale', palette.stale],
      ['down', palette.down],
      ['inactive', palette.inactive],
    ];

    for (const [status, expected] of cases) {
      expect(statusColorFor(status, palette)).toBe(expected);
    }
  });
});

describe('railwayMarkersFromRegions', () => {
  it('resolves known regions to { region, lat, lon } markers', () => {
    expect(railwayMarkersFromRegions(['us-west2'])).toEqual([
      { region: 'us-west2', lat: 37.378463, lon: -121.954945 },
    ]);
  });

  it('drops regions with no known coordinate', () => {
    expect(railwayMarkersFromRegions(['moon-base-1', 'us-west2'])).toEqual([
      { region: 'us-west2', lat: 37.378463, lon: -121.954945 },
    ]);
  });
});
