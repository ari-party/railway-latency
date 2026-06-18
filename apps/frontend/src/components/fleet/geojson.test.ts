import { describe, expect, it } from 'vitest';

import {
  matchPopByHikari,
  probePopArcsGeoJSON,
  probesToGeoJSON,
} from '@/components/fleet/geojson';

import type { ProbePopRoute } from '@/components/fleet/geojson';
import type { RailwayPop } from '@/components/fleet/usePops';
import type { RailwayMarker } from '@/components/map/markers';
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

const pops: RailwayPop[] = [
  {
    id: 'ams1',
    name: 'Amsterdam',
    region: 'ams',
    status: 'available',
    geo: { lat: 52.33, lon: 4.93 },
  },
  {
    id: 'iad1',
    name: 'Ashburn',
    region: 'iad',
    status: 'available',
    geo: { lat: 39.02, lon: -77.45 },
  },
];

const regions: RailwayMarker[] = [
  { region: 'europe-west4-drams3a', lat: 52.28, lon: 4.77 },
  { region: 'us-east4-eqdc4a', lat: 39.01, lon: -77.45 },
];

const probe = { lat: 1.29, lon: 103.79 };

// Great-circle interpolation routes endpoints through trig, so the terminal
// point lands within float epsilon of the target. Longitudes are also normalized
// for antimeridian continuity (a Pacific crossing yields target+360), so the
// comparison wraps the longitude difference into (-180, 180].
function expectPoint(actual: number[] | undefined, expected: [number, number]) {
  const lonDiff = ((((actual?.[0] ?? NaN) - expected[0]) % 360) + 540) % 360;
  expect(lonDiff - 180).toBeCloseTo(0, 5);
  expect(actual?.[1]).toBeCloseTo(expected[1], 5);
}

describe('matchPopByHikari', () => {
  it('matches a pop by exact id', () => {
    expect(matchPopByHikari('iad1', pops)?.id).toBe('iad1');
  });

  it('falls back to the digitless region code', () => {
    expect(matchPopByHikari('ams2', pops)?.id).toBe('ams1');
  });

  it('returns null when nothing matches', () => {
    expect(matchPopByHikari('zzz9', pops)).toBeNull();
  });
});

describe('probePopArcsGeoJSON', () => {
  it('emits a probe→pop and pop→region leg per matched route', () => {
    const routes: ProbePopRoute[] = [
      { dst: 'europe-west4-drams3a', hikariPop: 'ams1', hits: 9 },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(2);
    expect(
      collection.features.map((feature) => feature.properties.segment),
    ).toEqual(['probe-pop', 'pop-region']);

    const [toPop, toRegion] = collection.features;
    expectPoint(toPop.geometry.coordinates[0], [probe.lon, probe.lat]);
    expectPoint(toPop.geometry.coordinates.at(-1), [4.93, 52.33]);
    expectPoint(toRegion.geometry.coordinates[0], [4.93, 52.33]);
    expectPoint(toRegion.geometry.coordinates.at(-1), [4.77, 52.28]);
  });

  it('keeps multiple pops for the same destination as distinct paths', () => {
    const routes: ProbePopRoute[] = [
      { dst: 'us-east4-eqdc4a', hikariPop: 'iad1', hits: 9 },
      { dst: 'us-east4-eqdc4a', hikariPop: 'ams1', hits: 2 },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(4);
    expect(
      collection.features.map((feature) => feature.properties.hikariPop),
    ).toEqual(['iad1', 'iad1', 'ams1', 'ams1']);
  });

  it('draws only the probe→pop leg when the destination has no marker', () => {
    const routes: ProbePopRoute[] = [
      { dst: 'unknown-region', hikariPop: 'iad1', hits: 4 },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.segment).toBe('probe-pop');
    expectPoint(collection.features[0].geometry.coordinates.at(-1), [
      -77.45, 39.02,
    ]);
  });

  it('falls back to a straight probe→region line when the pop is unknown', () => {
    const routes: ProbePopRoute[] = [
      { dst: 'us-east4-eqdc4a', hikariPop: 'zzz9', hits: 4 },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(1);
    expectPoint(collection.features[0].geometry.coordinates.at(-1), [
      -77.45, 39.01,
    ]);
  });

  it('drops a route with neither a pop nor a destination marker', () => {
    const routes: ProbePopRoute[] = [
      { dst: 'unknown-region', hikariPop: 'zzz9', hits: 4 },
    ];

    expect(probePopArcsGeoJSON(probe, routes, pops, regions).features).toEqual(
      [],
    );
  });
});
