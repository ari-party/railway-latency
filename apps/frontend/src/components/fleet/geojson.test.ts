import { describe, expect, it } from 'vitest';

import { probesToGeoJSON } from '@/components/fleet/geojson';

import type { ProbeMetadata } from '@railway-latency/types';

describe('probesToGeoJSON', () => {
  it('maps probes to point features with id + status properties', () => {
    const probes: ProbeMetadata[] = [
      { probeId: 'asia-hcloud-sin1', lat: 1.29, lon: 103.85, status: 'green' },
    ];

    expect(probesToGeoJSON(probes)).toEqual({
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [103.85, 1.29] },
          properties: { probeId: 'asia-hcloud-sin1', status: 'green' },
        },
      ],
    });
  });
});
