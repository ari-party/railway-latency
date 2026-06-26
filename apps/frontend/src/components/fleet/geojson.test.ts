import { describe, expect, it } from 'vitest';

import {
  matchPopByHikari,
  probeCfPopArcsGeoJSON,
  probePopArcsGeoJSON,
  probesToGeoJSON,
} from '@/components/fleet/geojson';

import type { ProbePopRoute } from '@/components/fleet/geojson';
import type { RailwayPop } from '@/components/fleet/usePops';
import type { RailwayMarker } from '@/components/map/markers';
import type { LngLat } from '@/utils/greatCircle';
import type { ProbeMetadata } from '@railway-latency/types';

describe('probesToGeoJSON', () => {
  it('maps probes to point features with id + status properties', () => {
    const probes: ProbeMetadata[] = [
      {
        probeId: 'asia-hcloud-sin1',
        lat: 1.29,
        lon: 103.85,
        status: 'green',
        asn: null,
      },
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
  it('emits a shared probe→pop leg and a pop→region leg for one route', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'europe-west4-drams3a',
        cfPop: '',
        hikariPop: 'ams1',
        hits: 9,
        latencyMs: 24,
      },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(2);
    const [toPop, toRegion] = collection.features;

    expect(toPop.properties.segment).toBe('probe-pop');
    expect(toPop.properties.pop).toBe('ams1');
    expect(JSON.parse(toPop.properties.dests!)).toEqual([
      { dst: 'europe-west4-drams3a', latencyMs: 24 },
    ]);
    expectPoint(toPop.geometry.coordinates[0], [probe.lon, probe.lat]);
    expectPoint(toPop.geometry.coordinates.at(-1), [4.93, 52.33]);

    expect(toRegion.properties.segment).toBe('pop-region');
    expect(toRegion.properties.dst).toBe('europe-west4-drams3a');
    expect(toRegion.properties.latencyMs).toBe(24);
    expectPoint(toRegion.geometry.coordinates[0], [4.93, 52.33]);
    expectPoint(toRegion.geometry.coordinates.at(-1), [4.77, 52.28]);
  });

  it('stacks every destination reached through one pop on the shared leg', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'us-east4-eqdc4a',
        cfPop: '',
        hikariPop: 'iad1',
        hits: 9,
        latencyMs: 12,
      },
      {
        dst: 'europe-west4-drams3a',
        cfPop: '',
        hikariPop: 'iad1',
        hits: 4,
        latencyMs: 88,
      },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    // one shared probe→pop leg + one pop→region leg per destination
    expect(collection.features).toHaveLength(3);

    const sharedLeg = collection.features.find(
      (feature) => feature.properties.segment === 'probe-pop',
    );
    expect(JSON.parse(sharedLeg!.properties.dests!)).toEqual([
      { dst: 'us-east4-eqdc4a', latencyMs: 12 },
      { dst: 'europe-west4-drams3a', latencyMs: 88 },
    ]);
    expect(
      collection.features
        .filter((feature) => feature.properties.segment === 'pop-region')
        .map((feature) => feature.properties.dst),
    ).toEqual(['us-east4-eqdc4a', 'europe-west4-drams3a']);
  });

  it('keeps multiple pops for one destination as distinct paths', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'us-east4-eqdc4a',
        cfPop: '',
        hikariPop: 'iad1',
        hits: 9,
        latencyMs: 12,
      },
      {
        dst: 'us-east4-eqdc4a',
        cfPop: '',
        hikariPop: 'ams1',
        hits: 2,
        latencyMs: 70,
      },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(4);
    expect(
      collection.features.map((feature) => feature.properties.pop),
    ).toEqual(['iad1', 'iad1', 'ams1', 'ams1']);
  });

  it('draws only the probe→pop leg when the destination has no marker', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'unknown-region',
        cfPop: '',
        hikariPop: 'iad1',
        hits: 4,
        latencyMs: 10,
      },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(1);
    expect(collection.features[0].properties.segment).toBe('probe-pop');
    expectPoint(
      collection.features[0].geometry.coordinates.at(-1),
      [-77.45, 39.02],
    );
  });

  it('falls back to a straight probe→region line when the pop is unknown', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'us-east4-eqdc4a',
        cfPop: '',
        hikariPop: 'zzz9',
        hits: 4,
        latencyMs: 50,
      },
    ];

    const collection = probePopArcsGeoJSON(probe, routes, pops, regions);

    expect(collection.features).toHaveLength(1);
    expect(JSON.parse(collection.features[0].properties.dests!)).toEqual([
      { dst: 'us-east4-eqdc4a', latencyMs: 50 },
    ]);
    expectPoint(
      collection.features[0].geometry.coordinates.at(-1),
      [-77.45, 39.01],
    );
  });

  it('drops a route with neither a pop nor a destination marker', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'unknown-region',
        cfPop: '',
        hikariPop: 'zzz9',
        hits: 4,
        latencyMs: null,
      },
    ];

    expect(probePopArcsGeoJSON(probe, routes, pops, regions).features).toEqual(
      [],
    );
  });
});

const cfLocations = new Map<string, LngLat>([
  ['AMS', [4.76, 52.31]],
  ['IAD', [-77.46, 38.95]],
]);

describe('probeCfPopArcsGeoJSON', () => {
  it('chains probe→cf→pop→region for one proxied route', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'europe-west4-drams3a',
        cfPop: 'AMS',
        hikariPop: 'ams1',
        hits: 9,
        latencyMs: 24,
      },
    ];

    const collection = probeCfPopArcsGeoJSON(
      probe,
      routes,
      cfLocations,
      pops,
      regions,
    );

    expect(
      collection.features.map((feature) => feature.properties.segment),
    ).toEqual(['probe-cfpop', 'cfpop-pop', 'pop-region']);

    const [toCf, toPop, toRegion] = collection.features;

    expect(toCf.properties.pop).toBe('AMS');
    expectPoint(toCf.geometry.coordinates[0], [probe.lon, probe.lat]);
    expectPoint(toCf.geometry.coordinates.at(-1), [4.76, 52.31]);

    expect(toPop.properties.pop).toBe('ams1');
    expectPoint(toPop.geometry.coordinates[0], [4.76, 52.31]);
    expectPoint(toPop.geometry.coordinates.at(-1), [4.93, 52.33]);

    expect(toRegion.properties.dst).toBe('europe-west4-drams3a');
    expectPoint(toRegion.geometry.coordinates[0], [4.93, 52.33]);
    expectPoint(toRegion.geometry.coordinates.at(-1), [4.77, 52.28]);
  });

  it('stacks every destination behind one cf pop on the shared ingress leg', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'us-east4-eqdc4a',
        cfPop: 'IAD',
        hikariPop: 'iad1',
        hits: 9,
        latencyMs: 12,
      },
      {
        dst: 'europe-west4-drams3a',
        cfPop: 'IAD',
        hikariPop: 'iad1',
        hits: 4,
        latencyMs: 88,
      },
    ];

    const collection = probeCfPopArcsGeoJSON(
      probe,
      routes,
      cfLocations,
      pops,
      regions,
    );

    const ingress = collection.features.filter(
      (feature) => feature.properties.segment === 'probe-cfpop',
    );
    expect(ingress).toHaveLength(1);
    expect(JSON.parse(ingress[0].properties.dests!)).toEqual([
      { dst: 'us-east4-eqdc4a', latencyMs: 12 },
      { dst: 'europe-west4-drams3a', latencyMs: 88 },
    ]);
  });

  it('starts the leg at the probe when the cf pop is unknown', () => {
    const routes: ProbePopRoute[] = [
      {
        dst: 'europe-west4-drams3a',
        cfPop: 'ZZZ',
        hikariPop: 'ams1',
        hits: 9,
        latencyMs: 24,
      },
    ];

    const collection = probeCfPopArcsGeoJSON(
      probe,
      routes,
      cfLocations,
      pops,
      regions,
    );

    expect(
      collection.features.map((feature) => feature.properties.segment),
    ).toEqual(['probe-pop', 'pop-region']);
    expectPoint(collection.features[0].geometry.coordinates[0], [
      probe.lon,
      probe.lat,
    ]);
  });
});
