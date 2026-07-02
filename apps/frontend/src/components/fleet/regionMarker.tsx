import { Box, Text } from '@chakra-ui/react';
import React from 'react';
import { Marker } from 'react-map-gl/maplibre';

import type { RailwayMarker } from '@/components/map/markers';

export const REGION_COLOR = '#a96df3';

export function RegionMarker({
  marker,
  onHover,
  onSelect,
  selected,
}: {
  marker: RailwayMarker;
  onHover: (marker: RailwayMarker | null) => void;
  onSelect: (region: string) => void;
  selected: boolean;
}) {
  return (
    <Marker
      longitude={marker.lon}
      latitude={marker.lat}
      anchor="center"
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        onSelect(marker.region);
      }}
    >
      <Box position="relative" width="10px" height="10px">
        {selected && (
          <Box
            position="absolute"
            top="50%"
            left="50%"
            width="24px"
            height="24px"
            borderRadius="full"
            border="2px solid"
            borderColor="accent"
            transform="translate(-50%, -50%)"
          />
        )}

        <Box
          width="10px"
          height="10px"
          borderRadius="full"
          bg={REGION_COLOR}
          border="2px solid rgba(255, 255, 255, 0.85)"
          boxShadow="0 0 10px rgba(169, 109, 243, 0.85)"
          cursor="pointer"
          transition="transform 0.15s ease"
          _hover={{ transform: 'scale(1.3)' }}
          onMouseEnter={() => onHover(marker)}
          onMouseLeave={() => onHover(null)}
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
          pointerEvents="none"
          css={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
        >
          {marker.region}
        </Text>
      </Box>
    </Marker>
  );
}
