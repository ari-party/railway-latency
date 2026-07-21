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

const SPREAD_RADIUS_METERS = 200;
const SPREAD_RADIUS_DEG = SPREAD_RADIUS_METERS / 111_320;

export function spreadProbes(
  probes: readonly GlobalpingProbeResult[],
): GlobalpingProbeResult[] {
  const groups = new Map<string, number[]>();
  probes.forEach((entry, index) => {
    const key = `${entry.probe.lat},${entry.probe.lon}`;
    const group = groups.get(key);
    if (group) group.push(index);
    else groups.set(key, [index]);
  });

  const spread = [...probes];

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;

    indices.forEach((probeIndex, position) => {
      const angle = (2 * Math.PI * position) / indices.length;
      const entry = probes[probeIndex];
      spread[probeIndex] = {
        ...entry,
        probe: {
          ...entry.probe,
          lat: entry.probe.lat + SPREAD_RADIUS_DEG * Math.sin(angle),
          lon: entry.probe.lon + SPREAD_RADIUS_DEG * Math.cos(angle),
        },
      };
    });
  }

  return spread;
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
