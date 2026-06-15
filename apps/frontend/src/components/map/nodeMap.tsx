import {
  Box,
  HStack,
  Link as ChakraLink,
  Stack,
  Text,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import React from 'react';
import MapGL, { Marker, NavigationControl, Popup } from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import type { RailwayMarker } from '@/components/map/markers';
import type { ProbeMetadata, ProbeStatus } from '@railway-latency/types';

const MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const STATUS_COLOR: Record<ProbeStatus, string> = {
  green: '#22c55e',
  stale: '#f59e0b',
  down: '#ef4444',
  inactive: '#6b7280',
};

const STATUS_LABEL: Record<ProbeStatus, string> = {
  green: 'Online',
  stale: 'Stale',
  down: 'Down',
  inactive: 'Inactive',
};

const STATUSES: ProbeStatus[] = ['green', 'stale', 'down', 'inactive'];

const REGION_COLOR = '#3b82f6';

type Selected =
  | { kind: 'probe'; probe: ProbeMetadata }
  | { kind: 'region'; marker: RailwayMarker };

function MapDot({ color }: { color: string }) {
  return (
    <Box
      width="11px"
      height="11px"
      borderRadius="full"
      backgroundColor={color}
      borderWidth="2px"
      borderColor="white"
      cursor="pointer"
    />
  );
}

export function NodeMap({
  probes,
  regions,
}: {
  probes: ProbeMetadata[];
  regions: RailwayMarker[];
}) {
  const [selected, setSelected] = React.useState<Selected | null>(null);

  return (
    <Box position="relative" width="100%" height="100%">
      <MapGL
        mapStyle={MAP_STYLE_URL}
        initialViewState={{ longitude: 0, latitude: 20, zoom: 1.4 }}
        renderWorldCopies={false}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {regions.map((marker) => (
          <Marker
            key={`region-${marker.region}`}
            longitude={marker.lon}
            latitude={marker.lat}
            onClick={() => setSelected({ kind: 'region', marker })}
          >
            <MapDot color={REGION_COLOR} />
          </Marker>
        ))}

        {probes.map((probe) => (
          <Marker
            key={`probe-${probe.probeId}`}
            longitude={probe.lon}
            latitude={probe.lat}
            onClick={() => setSelected({ kind: 'probe', probe })}
          >
            <MapDot color={STATUS_COLOR[probe.status]} />
          </Marker>
        ))}

        {selected?.kind === 'probe' && (
          <Popup
            longitude={selected.probe.lon}
            latitude={selected.probe.lat}
            closeOnClick={false}
            onClose={() => setSelected(null)}
          >
            <Stack gap={1} fontSize="sm">
              <Text fontWeight={600}>
                {selected.probe.probeId} · {STATUS_LABEL[selected.probe.status]}
              </Text>
              <ChakraLink asChild color="blue.600">
                <NextLink
                  href={`/?src=${encodeURIComponent(selected.probe.probeId)}`}
                >
                  Explore from here →
                </NextLink>
              </ChakraLink>
            </Stack>
          </Popup>
        )}

        {selected?.kind === 'region' && (
          <Popup
            longitude={selected.marker.lon}
            latitude={selected.marker.lat}
            closeOnClick={false}
            onClose={() => setSelected(null)}
          >
            <Stack gap={1} fontSize="sm">
              <Text fontWeight={600}>{selected.marker.region}</Text>
              <ChakraLink asChild color="blue.600">
                <NextLink
                  href={`/?src=${encodeURIComponent(selected.marker.region)}`}
                >
                  Explore from here →
                </NextLink>
              </ChakraLink>
            </Stack>
          </Popup>
        )}
      </MapGL>

      <Box
        position="absolute"
        bottom={3}
        left={3}
        bg="bg.panel"
        borderWidth="1px"
        borderRadius="md"
        paddingX={3}
        paddingY={2}
      >
        <HStack gap={3} fontSize="xs" color="fg.muted">
          {STATUSES.map((status) => (
            <HStack key={status} gap={1}>
              <Box
                width="8px"
                height="8px"
                borderRadius="full"
                backgroundColor={STATUS_COLOR[status]}
              />
              <Text>{STATUS_LABEL[status]}</Text>
            </HStack>
          ))}
        </HStack>
      </Box>
    </Box>
  );
}
