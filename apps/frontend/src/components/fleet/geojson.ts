import { greatCircleArc } from '@/utils/greatCircle';

import type { RailwayPop } from '@/components/fleet/usePops';
import type { RailwayMarker } from '@/components/map/markers';
import type { LngLat } from '@/utils/greatCircle';
import type { ProbeMetadata } from '@railway-latency/types';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export interface ProbePopRoute {
  dst: string;
  hikariPop: string;
  hits: number;
}

export type ArcSegment = 'probe-pop' | 'pop-region';

interface ArcProperties {
  dst: string;
  hikariPop: string;
  segment: ArcSegment;
}

export function probesToGeoJSON(
  probes: readonly ProbeMetadata[],
): FeatureCollection<Point, { probeId: string; status: string }> {
  return {
    type: 'FeatureCollection',
    features: probes.map((probe) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [probe.lon, probe.lat] },
      properties: { probeId: probe.probeId, status: probe.status },
    })),
  };
}

export function probeArcsGeoJSON(
  probe: { lat: number; lon: number },
  regions: readonly RailwayMarker[],
): FeatureCollection<LineString, { region: string }> {
  return {
    type: 'FeatureCollection',
    features: regions.map((region) => ({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: greatCircleArc(
          [probe.lon, probe.lat],
          [region.lon, region.lat],
        ),
      },
      properties: { region: region.region },
    })),
  };
}

export function matchPopByHikari(
  hikariPop: string,
  pops: readonly RailwayPop[],
): RailwayPop | null {
  const exact = pops.find((pop) => pop.id === hikariPop);
  if (exact) return exact;

  // `hikari_pop` carries a trailing site digit (`iad1`); pops also key on the
  // digitless region code (`iad`).
  const regionCode = hikariPop.replace(/\d+$/, '');
  return pops.find((pop) => pop.region === regionCode) ?? null;
}

function arcFeature(
  coordinates: LngLat[],
  properties: ArcProperties,
): Feature<LineString, ArcProperties> {
  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates },
    properties,
  };
}

export function probePopArcsGeoJSON(
  probe: { lat: number; lon: number },
  routes: readonly ProbePopRoute[],
  pops: readonly RailwayPop[],
  regions: readonly RailwayMarker[],
): FeatureCollection<LineString, ArcProperties> {
  const origin: LngLat = [probe.lon, probe.lat];

  const features = routes.flatMap((route) => {
    const pop = matchPopByHikari(route.hikariPop, pops);
    const region =
      regions.find((marker) => marker.region === route.dst) ?? null;
    const base = { dst: route.dst, hikariPop: route.hikariPop };

    // One feature per leg, not a concatenated line: across the antimeridian the
    // two great-circle arcs would meet with a 360° longitude jump at the pop.
    if (pop) {
      const popPoint: LngLat = [pop.geo.lon, pop.geo.lat];
      const legs = [
        arcFeature(greatCircleArc(origin, popPoint), {
          ...base,
          segment: 'probe-pop',
        }),
      ];
      if (region) {
        legs.push(
          arcFeature(greatCircleArc(popPoint, [region.lon, region.lat]), {
            ...base,
            segment: 'pop-region',
          }),
        );
      }
      return legs;
    }

    if (region) {
      return [
        arcFeature(greatCircleArc(origin, [region.lon, region.lat]), {
          ...base,
          segment: 'probe-pop',
        }),
      ];
    }

    return [];
  });

  return { type: 'FeatureCollection', features };
}
