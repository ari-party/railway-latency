import { Box } from '@chakra-ui/react';
import React from 'react';
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Source,
} from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import { probesToGeoJSON } from '@/components/fleet/geojson';

import type { RailwayMarker } from '@/components/map/markers';
import type { ProbeMetadata } from '@railway-latency/types';
import type {
  CircleLayerSpecification,
  MapLayerMouseEvent,
  SymbolLayerSpecification,
} from 'react-map-gl/maplibre';

const MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';
const REGION_COLOR = '#3b82f6';

const STATUS_PAINT: CircleLayerSpecification['paint'] = {
  'circle-radius': 6,
  'circle-stroke-width': 2,
  'circle-stroke-color': '#ffffff',
  'circle-color': [
    'match',
    ['get', 'status'],
    'green',
    '#22c55e',
    'stale',
    '#f59e0b',
    'down',
    '#ef4444',
    '#6b7280',
  ],
};

const CLUSTER_PAINT: CircleLayerSpecification['paint'] = {
  'circle-color': '#1d4ed8',
  'circle-stroke-width': 2,
  'circle-stroke-color': '#ffffff',
  'circle-radius': ['step', ['get', 'point_count'], 14, 10, 18, 50, 24],
};

const CLUSTER_COUNT_LAYOUT: SymbolLayerSpecification['layout'] = {
  'text-field': ['get', 'point_count_abbreviated'],
  'text-size': 12,
};

export function FleetMap({
  onSelectProbe,
  probes,
  regions,
}: {
  onSelectProbe: (probeId: string) => void;
  probes: ProbeMetadata[];
  regions: RailwayMarker[];
}) {
  const data = React.useMemo(() => probesToGeoJSON(probes), [probes]);

  const handleClick = React.useCallback(
    (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature) return;

      const probeId = feature.properties?.probeId as string | undefined;
      if (probeId) {
        onSelectProbe(probeId);
        return;
      }

      const clusterId = feature.properties?.cluster_id as number | undefined;
      if (clusterId == null) return;

      const source = event.target.getSource('probes');
      // Runtime GeoJSONSource; getClusterExpansionZoom is not in the union type.
      (
        source as unknown as {
          getClusterExpansionZoom: (
            id: number,
            cb: (err: unknown, zoom: number) => void,
          ) => void;
        }
      ).getClusterExpansionZoom(clusterId, (err, zoom) => {
        if (err) return;
        const [lon, lat] = (
          feature.geometry as unknown as { coordinates: [number, number] }
        ).coordinates;
        event.target.easeTo({ center: [lon, lat], zoom });
      });
    },
    [onSelectProbe],
  );

  return (
    <Box position="relative" width="100%" height="100%">
      <MapGL
        mapStyle={MAP_STYLE_URL}
        initialViewState={{ longitude: 0, latitude: 20, zoom: 1.4 }}
        renderWorldCopies={false}
        style={{ width: '100%', height: '100%' }}
        interactiveLayerIds={['clusters', 'probe-points']}
        onClick={handleClick}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {regions.map((marker) => (
          <Marker
            key={`region-${marker.region}`}
            longitude={marker.lon}
            latitude={marker.lat}
          >
            <Box
              width="9px"
              height="9px"
              borderRadius="full"
              backgroundColor={REGION_COLOR}
              borderWidth="2px"
              borderColor="white"
            />
          </Marker>
        ))}

        <Source
          id="probes"
          type="geojson"
          data={data}
          cluster
          clusterRadius={50}
        >
          <Layer
            id="clusters"
            type="circle"
            filter={['has', 'point_count']}
            paint={CLUSTER_PAINT}
          />
          <Layer
            id="cluster-count"
            type="symbol"
            filter={['has', 'point_count']}
            layout={CLUSTER_COUNT_LAYOUT}
            paint={{ 'text-color': '#ffffff' }}
          />
          <Layer
            id="probe-points"
            type="circle"
            filter={['!', ['has', 'point_count']]}
            paint={STATUS_PAINT}
          />
        </Source>
      </MapGL>
    </Box>
  );
}
