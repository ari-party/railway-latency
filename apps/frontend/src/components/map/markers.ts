import { REGION_COORDS } from '@railway-latency/utils';

export interface RailwayMarker {
  region: string;
  lat: number;
  lon: number;
}

export function railwayMarkersFromRegions(regions: string[]): RailwayMarker[] {
  return regions.flatMap((region) => {
    const coord = REGION_COORDS[region];
    return coord ? [{ region, lat: coord.lat, lon: coord.lon }] : [];
  });
}
