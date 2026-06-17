import { greatCircleArc } from '@/utils/greatCircle';

import type { RailwayMarker } from '@/components/map/markers';
import type { ProbeMetadata } from '@railway-latency/types';
import type { FeatureCollection, LineString, Point } from 'geojson';

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
