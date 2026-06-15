import { Box, HStack, Link as ChakraLink, Stack, Text } from '@chakra-ui/react';
import NextLink from 'next/link';
import React from 'react';
import MapGL, {
  Layer,
  Marker,
  NavigationControl,
  Popup,
  Source,
} from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import {
  arcCurve,
  latencyColor,
  splitAtAntimeridian,
} from '@/components/map/arc';
import { NetworkSegmentGroup } from '@/components/querySegmentGroups';
import { coerceNetwork } from '@/utils/query';

import type { RailwayMarker } from '@/components/map/markers';
import type { RouterOutputs } from '@/utils/trpc';
import type {
  Network,
  ProbeMetadata,
  ProbeStatus,
} from '@railway-latency/types';
import type { Feature, FeatureCollection } from 'geojson';

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

const REGION_COLOR = '#3b82f6';
const FOCUSED_COLOR = '#60a5fa';

type Selected =
  | { kind: 'probe'; probe: ProbeMetadata }
  | { kind: 'region'; marker: RailwayMarker };

function MapDot({ color, ring }: { color: string; ring?: boolean }) {
  return (
    <Box
      width={ring ? '15px' : '11px'}
      height={ring ? '15px' : '11px'}
      borderRadius="full"
      backgroundColor={color}
      borderWidth="2px"
      borderColor="white"
      boxShadow={ring ? '0 0 0 4px rgba(96,165,250,0.35)' : undefined}
      cursor="pointer"
    />
  );
}

export function LatencyMap({
  latency,
  probes,
  regions,
}: {
  latency: RouterOutputs['table']['data'];
  probes: ProbeMetadata[];
  regions: RailwayMarker[];
}) {
  const [network, setNetwork] = React.useState<Network>('private');
  const [focused, setFocused] = React.useState<string | null>(
    regions[0]?.region ?? null,
  );
  const [selected, setSelected] = React.useState<Selected | null>(null);

  const arcs: FeatureCollection | null = React.useMemo(() => {
    if (!focused) return null;
    const source = regions.find((marker) => marker.region === focused);
    if (!source) return null;

    const pairs = latency[network]?.[focused] ?? {};
    const features = regions.flatMap((marker): Feature[] => {
      if (marker.region === focused) return [];
      const milliseconds = pairs[marker.region]?.http;
      if (milliseconds == null) return [];
      return [
        {
          type: 'Feature',
          properties: { color: latencyColor(milliseconds) },
          geometry: {
            type: 'MultiLineString',
            coordinates: splitAtAntimeridian(
              arcCurve(
                { lat: source.lat, lon: source.lon },
                { lat: marker.lat, lon: marker.lon },
              ),
            ),
          },
        },
      ];
    });

    return { type: 'FeatureCollection', features };
  }, [focused, latency, network, regions]);

  return (
    <Box position="relative" width="100%" height="100%">
      <MapGL
        mapStyle={MAP_STYLE_URL}
        initialViewState={{ longitude: 0, latitude: 20, zoom: 1.4 }}
        renderWorldCopies={false}
        style={{ width: '100%', height: '100%' }}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {arcs && (
          <Source id="latency-arcs" type="geojson" data={arcs}>
            <Layer
              id="latency-arcs-line"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': ['get', 'color'],
                'line-width': 2,
                'line-opacity': 0.85,
              }}
            />
          </Source>
        )}

        {regions.map((marker) => (
          <Marker
            key={`region-${marker.region}`}
            longitude={marker.lon}
            latitude={marker.lat}
            onClick={() => {
              setFocused(marker.region);
              setSelected({ kind: 'region', marker });
            }}
          >
            <MapDot
              color={marker.region === focused ? FOCUSED_COLOR : REGION_COLOR}
              ring={marker.region === focused}
            />
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
            <Stack gap={1} color="gray.900" fontSize="sm">
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
            <Stack gap={1} color="gray.900" fontSize="sm">
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
        top={3}
        left={3}
        bg="bg.panel"
        borderWidth="1px"
        borderRadius="md"
        padding={2}
      >
        <NetworkSegmentGroup
          value={network}
          onValueChange={(value) => setNetwork(coerceNetwork(value))}
        />
      </Box>

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
        <HStack gap={2} fontSize="xs" color="fg.muted">
          <Text>fast</Text>
          <Box
            width="90px"
            height="8px"
            borderRadius="full"
            style={{
              background:
                'linear-gradient(to right,#16a34a,#84cc16,#eab308,#f59e0b,#ef4444)',
            }}
          />
          <Text>slow</Text>
        </HStack>
      </Box>
    </Box>
  );
}
