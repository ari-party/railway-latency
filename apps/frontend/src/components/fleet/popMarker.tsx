import { Box } from '@chakra-ui/react';
import React from 'react';
import { Marker } from 'react-map-gl/maplibre';

import { REGION_COLOR } from '@/components/fleet/regionMarker';

import type { RailwayPop } from '@/components/fleet/usePops';

export const POP_COLOR = '#2bb8c4';
const POP_DOWN_COLOR = 'hsl(2, 82%, 63%)';

export function PopMarker({
  dimmed = false,
  highlighted = false,
  onHover,
  pop,
}: {
  dimmed?: boolean;
  highlighted?: boolean;
  onHover: (pop: RailwayPop | null) => void;
  pop: RailwayPop;
}) {
  const color = pop.status === 'available' ? POP_COLOR : POP_DOWN_COLOR;
  const opacity = dimmed ? 0.25 : highlighted ? 1 : 0.85;
  const boxShadow = highlighted
    ? `0 0 0 2.5px ${REGION_COLOR}99, 0 0 10px ${color}`
    : `0 0 6px ${color}`;

  return (
    <Marker longitude={pop.geo.lon} latitude={pop.geo.lat} anchor="center">
      <Box
        display="flex"
        alignItems="center"
        justifyContent="center"
        width="16px"
        height="16px"
        onMouseEnter={() => onHover(pop)}
        onMouseLeave={() => onHover(null)}
      >
        <Box
          width="7px"
          height="7px"
          borderRadius="full"
          bg={color}
          border="1px solid rgba(255, 255, 255, 0.7)"
          boxShadow={boxShadow}
          opacity={opacity}
          transition="opacity 0.2s ease, box-shadow 0.2s ease"
        />
      </Box>
    </Marker>
  );
}
