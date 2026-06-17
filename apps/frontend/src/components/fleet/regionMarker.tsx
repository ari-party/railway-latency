import { Box, Text } from '@chakra-ui/react';
import React from 'react';
import { Marker } from 'react-map-gl/maplibre';

import type { RailwayMarker } from '@/components/map/markers';

export const REGION_COLOR = '#a96df3';

export function RegionMarker({ marker }: { marker: RailwayMarker }) {
  return (
    <Marker longitude={marker.lon} latitude={marker.lat} anchor="center">
      <Box position="relative" width="10px" height="10px" pointerEvents="none">
        <Box
          width="10px"
          height="10px"
          borderRadius="full"
          bg={REGION_COLOR}
          border="2px solid rgba(255, 255, 255, 0.85)"
          boxShadow="0 0 10px rgba(169, 109, 243, 0.85)"
        />
        <Text
          position="absolute"
          top="13px"
          left="50%"
          transform="translateX(-50%)"
          whiteSpace="nowrap"
          fontFamily="mono"
          fontSize="9px"
          color="rgba(255, 255, 255, 0.82)"
          css={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {marker.region}
        </Text>
      </Box>
    </Marker>
  );
}
