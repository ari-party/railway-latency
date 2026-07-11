import { matchPopByHikari } from '@/components/fleet/geojson';
import { greatCircleArc } from '@/utils/greatCircle';

import type { RailwayPop } from '@/components/fleet/usePops';
import type { GlobalpingProbeResult } from '@/server/api/trpc/routers/globalping/types';
import type { Feature, FeatureCollection, LineString } from 'geojson';

export function probePopArcs(
  probes: readonly GlobalpingProbeResult[],
  pops: readonly RailwayPop[],
): FeatureCollection<LineString, { hikariPop: string }> {
  const features: Feature<LineString, { hikariPop: string }>[] = [];

  for (const entry of probes) {
    if (!entry.hikariPop) continue;

    const pop = matchPopByHikari(entry.hikariPop, pops);
    if (!pop) continue;

    features.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: greatCircleArc(
          [entry.probe.lon, entry.probe.lat],
          [pop.geo.lon, pop.geo.lat],
        ),
      },
      properties: { hikariPop: pop.id },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function hitPopIds(
  probes: readonly GlobalpingProbeResult[],
  pops: readonly RailwayPop[],
): Set<string> {
  const ids = new Set<string>();

  for (const entry of probes) {
    if (!entry.hikariPop) continue;

    const pop = matchPopByHikari(entry.hikariPop, pops);
    if (pop) ids.add(pop.id);
  }

  return ids;
}
