import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import React from 'react';
import MapGL, {
  AttributionControl,
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import { POP_COLOR, PopMarker } from '@/components/fleet/popMarker';
import { STATUS_COLOR } from '@/components/fleet/probeStatus';
import { usePops } from '@/components/fleet/usePops';
import { hitPopIds, probePopArcs } from '@/components/globalping/arcs';

import type { RailwayPop } from '@/components/fleet/usePops';
import type {
  GlobalpingProbeResult,
  GlobalpingResult,
} from '@/server/api/trpc/routers/globalping/types';

const MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

export function GlobalpingMap({
  onSelectProbe,
  result,
  selectedIndex,
}: {
  onSelectProbe: (index: number) => void;
  result: GlobalpingResult | null;
  selectedIndex: number | null;
}) {
  const pops = usePops();
  const [hoveredPop, setHoveredPop] = React.useState<RailwayPop | null>(null);
  const [hovered, setHovered] = React.useState<GlobalpingProbeResult | null>(
    null,
  );

  const probes = React.useMemo(() => result?.probes ?? [], [result]);
  const isHttp = result?.type === 'http';

  const arcs = React.useMemo(
    () => (isHttp ? probePopArcs(probes, pops) : null),
    [isHttp, probes, pops],
  );
  const hitPops = React.useMemo(
    () => (isHttp ? hitPopIds(probes, pops) : new Set<string>()),
    [isHttp, probes, pops],
  );

  return (
    <Box position="relative" width="100%" height="100%">
      <MapGL
        mapStyle={MAP_STYLE_URL}
        initialViewState={{ longitude: 0, latitude: 25, zoom: 1.4 }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        renderWorldCopies={false}
      >
        <NavigationControl position="top-left" showCompass={false} />
        <AttributionControl position="bottom-left" compact />

        {arcs && arcs.features.length > 0 && (
          <Source id="gp-arcs" type="geojson" data={arcs}>
            <Layer
              id="gp-arc-glow"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': POP_COLOR,
                'line-width': 4,
                'line-opacity': 0.12,
                'line-blur': 3,
              }}
            />
            <Layer
              id="gp-arc-line"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': POP_COLOR,
                'line-width': 1.3,
                'line-opacity': 0.6,
                'line-dasharray': [1.5, 2],
              }}
            />
          </Source>
        )}

        {pops.map((pop) => (
          <PopMarker
            key={`pop-${pop.id}`}
            pop={pop}
            highlighted={hitPops.has(pop.id)}
            dimmed={hitPops.size > 0 && !hitPops.has(pop.id)}
            onHover={setHoveredPop}
          />
        ))}

        {probes.map((entry, index) => {
          const color =
            STATUS_COLOR[entry.status === 'failed' ? 'down' : 'green'];
          const selected = index === selectedIndex;
          return (
            <Marker
              key={index}
              longitude={entry.probe.lon}
              latitude={entry.probe.lat}
              anchor="center"
              onClick={(event) => {
                event.originalEvent.stopPropagation();
                onSelectProbe(index);
              }}
            >
              <Box
                width="12px"
                height="12px"
                borderRadius="full"
                bg={color}
                border="2px solid rgba(8, 8, 12, 0.65)"
                boxShadow={
                  selected
                    ? `0 0 0 3px ${color}66, 0 0 10px ${color}`
                    : `0 0 6px ${color}`
                }
                cursor="pointer"
                transition="transform 0.15s ease"
                _hover={{ transform: 'scale(1.3)' }}
                onMouseEnter={() => setHovered(entry)}
                onMouseLeave={() => setHovered(null)}
              />
            </Marker>
          );
        })}

        {hovered && (
          <Popup
            longitude={hovered.probe.lon}
            latitude={hovered.probe.lat}
            anchor="bottom"
            offset={16}
            closeButton={false}
            closeOnClick={false}
          >
            <Stack gap="0.5">
              <Text fontFamily="mono" fontWeight="semibold">
                {hovered.probe.city}, {hovered.probe.country}
              </Text>
              <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                AS{hovered.probe.asn} · {hovered.probe.network}
              </Text>
            </Stack>
          </Popup>
        )}

        {!hovered && hoveredPop && (
          <Popup
            longitude={hoveredPop.geo.lon}
            latitude={hoveredPop.geo.lat}
            anchor="bottom"
            offset={16}
            closeButton={false}
            closeOnClick={false}
          >
            <HStack gap="2">
              <Box
                width="8px"
                height="8px"
                borderRadius="full"
                bg={POP_COLOR}
              />
              <Text fontFamily="mono" fontWeight="semibold">
                {hoveredPop.id}
              </Text>
            </HStack>
          </Popup>
        )}
      </MapGL>
    </Box>
  );
}
