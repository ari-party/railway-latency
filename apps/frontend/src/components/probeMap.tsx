import { useToken } from '@chakra-ui/react';
import { REGION_COORDS } from '@railway-latency/utils';
import React from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import type { ProbeMetadata, ProbeStatus } from '@railway-latency/types';

const MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

export interface StatusPalette {
  green: string;
  stale: string;
  down: string;
  inactive: string;
}

export interface RailwayMarker {
  region: string;
  lat: number;
  lon: number;
}

export function statusColorFor(
  status: ProbeStatus,
  palette: StatusPalette,
): string {
  return palette[status];
}

export function railwayMarkersFromRegions(regions: string[]): RailwayMarker[] {
  return regions.flatMap((region) => {
    const coord = REGION_COORDS[region];
    return coord ? [{ region, lat: coord.lat, lon: coord.lon }] : [];
  });
}

type Selected =
  | { kind: 'external'; probe: ProbeMetadata }
  | { kind: 'railway'; marker: RailwayMarker };

export function ProbeMap({
  external,
  railway,
}: {
  external: ProbeMetadata[];
  railway: RailwayMarker[];
}) {
  const [green, stale, down, inactive, railwayColor] = useToken('colors', [
    'green.500',
    'orange.400',
    'red.500',
    'gray.500',
    'blue.400',
  ]);
  const palette: StatusPalette = React.useMemo(
    () => ({ green, stale, down, inactive }),
    [green, stale, down, inactive],
  );

  const [selected, setSelected] = React.useState<Selected | null>(null);

  const externalMarkers = React.useMemo(
    () =>
      external.map((probe) => (
        <Marker
          key={`ext-${probe.probeId}`}
          longitude={probe.lon}
          latitude={probe.lat}
          color={statusColorFor(probe.status, palette)}
          onClick={() => setSelected({ kind: 'external', probe })}
        />
      )),
    [external, palette],
  );

  const railwayMarkers = React.useMemo(
    () =>
      railway.map((marker) => (
        <Marker
          key={`rw-${marker.region}`}
          longitude={marker.lon}
          latitude={marker.lat}
          color={railwayColor}
          onClick={() => setSelected({ kind: 'railway', marker })}
        />
      )),
    [railway, railwayColor],
  );

  return (
    <Map
      mapStyle={MAP_STYLE_URL}
      initialViewState={{ longitude: 0, latitude: 20, zoom: 1.4 }}
      style={{ width: '100%', height: '100%' }}
    >
      {externalMarkers}

      {railwayMarkers}

      {selected?.kind === 'external' && (
        <Popup
          longitude={selected.probe.lon}
          latitude={selected.probe.lat}
          onClose={() => setSelected(null)}
          closeOnClick={false}
        >
          {selected.probe.probeId} · {selected.probe.status}
        </Popup>
      )}

      {selected?.kind === 'railway' && (
        <Popup
          longitude={selected.marker.lon}
          latitude={selected.marker.lat}
          onClose={() => setSelected(null)}
          closeOnClick={false}
        >
          {selected.marker.region} · railway
        </Popup>
      )}
    </Map>
  );
}
