import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { cityNameFromProbeId } from '@railway-latency/utils';
import React from 'react';
import MapGL, {
  AttributionControl,
  Layer,
  NavigationControl,
  Popup,
  Source,
} from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import { probeArcsGeoJSON } from '@/components/fleet/geojson';
import { ProbeMarker } from '@/components/fleet/probeMarker';
import { STATUS_COLOR, STATUS_LABEL } from '@/components/fleet/probeStatus';
import { REGION_COLOR, RegionMarker } from '@/components/fleet/regionMarker';

import type { RailwayMarker } from '@/components/map/markers';
import type { ProbeMetadata } from '@railway-latency/types';
import type { MapRef } from 'react-map-gl/maplibre';

const MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export function FleetMap({
  onSelectProbe,
  probes,
  regions,
  selectedProbeId,
}: {
  onSelectProbe: (probeId: string) => void;
  probes: ProbeMetadata[];
  regions: RailwayMarker[];
  selectedProbeId: string | null;
}) {
  const mapRef = React.useRef<MapRef>(null);
  const [hovered, setHovered] = React.useState<ProbeMetadata | null>(null);

  const selectedProbe =
    probes.find((probe) => probe.probeId === selectedProbeId) ?? null;

  const arcs = React.useMemo(
    () => (selectedProbe ? probeArcsGeoJSON(selectedProbe, regions) : null),
    [selectedProbe, regions],
  );

  const flyToSelected = React.useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!selectedProbe) {
      map.easeTo({
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 300,
      });
      return;
    }

    map.flyTo({
      center: [selectedProbe.lon, selectedProbe.lat],
      zoom: Math.max(map.getZoom(), 3.4),
      duration: 1400,
      essential: true,
      padding: { top: 40, bottom: 40, left: 40, right: 560 },
    });
  }, [selectedProbe]);

  React.useEffect(() => {
    flyToSelected();
  }, [flyToSelected]);

  const hoveredCity = hovered ? cityNameFromProbeId(hovered.probeId) : null;

  return (
    <Box position="relative" width="100%" height="100%">
      <MapGL
        ref={mapRef}
        mapStyle={MAP_STYLE_URL}
        initialViewState={{ longitude: 0, latitude: 25, zoom: 1.5 }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        renderWorldCopies={false}
        onLoad={flyToSelected}
      >
        <NavigationControl position="top-left" showCompass={false} />
        <AttributionControl position="bottom-left" compact />

        {arcs && (
          <Source id="arcs" type="geojson" data={arcs}>
            <Layer
              id="arc-glow"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': REGION_COLOR,
                'line-width': 4,
                'line-opacity': 0.12,
                'line-blur': 3,
              }}
            />
            <Layer
              id="arc-line"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': REGION_COLOR,
                'line-width': 1.3,
                'line-opacity': 0.55,
                'line-dasharray': [1.5, 2],
              }}
            />
          </Source>
        )}

        {regions.map((marker) => (
          <RegionMarker key={`region-${marker.region}`} marker={marker} />
        ))}

        {probes.map((probe) => (
          <ProbeMarker
            key={probe.probeId}
            probe={probe}
            selected={probe.probeId === selectedProbeId}
            onHover={setHovered}
            onSelect={onSelectProbe}
          />
        ))}

        {hovered && (
          <Popup
            longitude={hovered.lon}
            latitude={hovered.lat}
            anchor="bottom"
            offset={18}
            closeButton={false}
            closeOnClick={false}
          >
            <Stack gap="1">
              <HStack gap="2">
                <Box
                  width="8px"
                  height="8px"
                  borderRadius="full"
                  backgroundColor={STATUS_COLOR[hovered.status]}
                />
                <Text fontFamily="mono" fontWeight="semibold">
                  {hovered.probeId}
                </Text>
              </HStack>
              {hoveredCity && (
                <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                  {hoveredCity}
                </Text>
              )}
              <Text
                fontSize="xs"
                color={STATUS_COLOR[hovered.status]}
                fontWeight="medium"
              >
                {STATUS_LABEL[hovered.status]}
              </Text>
            </Stack>
          </Popup>
        )}
      </MapGL>
    </Box>
  );
}
