import { describe, expect, it } from 'vitest';

import { railwayMarkersFromRegions } from '@/components/map/markers';

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
