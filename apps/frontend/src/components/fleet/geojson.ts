import { greatCircleArc } from '@/utils/greatCircle';

import type { RailwayPop } from '@/components/fleet/usePops';
import type { RailwayMarker } from '@/components/map/markers';
import type { LngLat } from '@/utils/greatCircle';
import type { ProbeMetadata } from '@railway-latency/types';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';

export interface ProbePopRoute {
  dst: string;
  cfPop: string;
  hikariPop: string;
  hits: number;
  latencyMs: number | null;
}

export type ArcSegment =
  | 'probe-pop'
  | 'pop-region'
  | 'probe-cfpop'
  | 'cfpop-pop'
  | 'cfpop-region';

export interface ArcDestination {
  dst: string;
  latencyMs: number | null;
}

interface ArcProperties {
  segment: ArcSegment;
  pop: string;
  dst?: string;
  latencyMs?: number | null;
  dests?: string;
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
  const findRegion = (dst: string) =>
    regions.find((marker) => marker.region === dst) ?? null;

  const routesByPop = new Map<string, ProbePopRoute[]>();
  for (const route of routes) {
    const group = routesByPop.get(route.hikariPop);
    if (group) group.push(route);
    else routesByPop.set(route.hikariPop, [route]);
  }

  const features: Feature<LineString, ArcProperties>[] = [];

  for (const [hikariPop, popRoutes] of routesByPop) {
    const pop = matchPopByHikari(hikariPop, pops);
    const dests = popRoutes.map((route) => ({
      dst: route.dst,
      latencyMs: route.latencyMs,
    }));

    if (!pop) {
      for (const route of popRoutes) {
        const region = findRegion(route.dst);
        if (!region) continue;
        features.push(
          arcFeature(greatCircleArc(origin, [region.lon, region.lat]), {
            segment: 'probe-pop',
            pop: hikariPop,
            dests: JSON.stringify([
              { dst: route.dst, latencyMs: route.latencyMs },
            ]),
          }),
        );
      }
      continue;
    }

    const popPoint: LngLat = [pop.geo.lon, pop.geo.lat];

    features.push(
      arcFeature(greatCircleArc(origin, popPoint), {
        segment: 'probe-pop',
        pop: hikariPop,
        dests: JSON.stringify(dests),
      }),
    );

    for (const route of popRoutes) {
      const region = findRegion(route.dst);
      if (!region) continue;
      features.push(
        arcFeature(greatCircleArc(popPoint, [region.lon, region.lat]), {
          segment: 'pop-region',
          pop: hikariPop,
          dst: route.dst,
          latencyMs: route.latencyMs,
        }),
      );
    }
  }

  return { type: 'FeatureCollection', features };
}

function groupRoutesBy(
  routes: readonly ProbePopRoute[],
  key: (route: ProbePopRoute) => string,
): Map<string, ProbePopRoute[]> {
  const groups = new Map<string, ProbePopRoute[]>();
  for (const route of routes) {
    const group = groups.get(key(route));
    if (group) group.push(route);
    else groups.set(key(route), [route]);
  }
  return groups;
}

function destsJSON(routes: readonly ProbePopRoute[]): string {
  return JSON.stringify(
    routes.map((route) => ({ dst: route.dst, latencyMs: route.latencyMs })),
  );
}

export function probeCfPopArcsGeoJSON(
  probe: { lat: number; lon: number },
  routes: readonly ProbePopRoute[],
  cfLocations: ReadonlyMap<string, LngLat>,
  pops: readonly RailwayPop[],
  regions: readonly RailwayMarker[],
): FeatureCollection<LineString, ArcProperties> {
  const origin: LngLat = [probe.lon, probe.lat];

  const findRegion = (dst: string) =>
    regions.find((marker) => marker.region === dst) ?? null;

  const features: Feature<LineString, ArcProperties>[] = [];

  for (const [cfPop, cfRoutes] of groupRoutesBy(
    routes,
    (route) => route.cfPop,
  )) {
    const cfPoint = cfPop ? (cfLocations.get(cfPop) ?? null) : null;
    const ingress = cfPoint ?? origin;

    if (cfPoint) {
      features.push(
        arcFeature(greatCircleArc(origin, cfPoint), {
          segment: 'probe-cfpop',
          pop: cfPop,
          dests: destsJSON(cfRoutes),
        }),
      );
    }

    const popSegment: ArcSegment = cfPoint ? 'cfpop-pop' : 'probe-pop';
    const directSegment: ArcSegment = cfPoint ? 'cfpop-region' : 'probe-pop';

    const routesByHikari = groupRoutesBy(cfRoutes, (route) => route.hikariPop);

    for (const [hikariPop, hikariRoutes] of routesByHikari) {
      const pop = matchPopByHikari(hikariPop, pops);

      if (!pop) {
        for (const route of hikariRoutes) {
          const region = findRegion(route.dst);
          if (!region) continue;

          features.push(
            arcFeature(greatCircleArc(ingress, [region.lon, region.lat]), {
              segment: directSegment,
              pop: cfPoint ? cfPop : hikariPop,
              dests: destsJSON([route]),
            }),
          );
        }

        continue;
      }

      const popPoint: LngLat = [pop.geo.lon, pop.geo.lat];

      features.push(
        arcFeature(greatCircleArc(ingress, popPoint), {
          segment: popSegment,
          pop: hikariPop,
          dests: destsJSON(hikariRoutes),
        }),
      );

      for (const route of hikariRoutes) {
        const region = findRegion(route.dst);
        if (!region) continue;

        features.push(
          arcFeature(greatCircleArc(popPoint, [region.lon, region.lat]), {
            segment: 'pop-region',
            pop: hikariPop,
            dst: route.dst,
            latencyMs: route.latencyMs,
          }),
        );
      }
    }
  }

  return { type: 'FeatureCollection', features };
}
