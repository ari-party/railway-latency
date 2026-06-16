import type { ProbeMetadata } from '@railway-latency/types';
import type { FeatureCollection, Point } from 'geojson';

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
