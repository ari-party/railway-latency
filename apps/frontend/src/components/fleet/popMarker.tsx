import { Box } from '@chakra-ui/react';
import React from 'react';
import { Marker } from 'react-map-gl/maplibre';

import type { RailwayPop } from '@/components/fleet/usePops';

// Teal keeps Railway PoPs distinct from regions (purple) and probes (status).
export const POP_COLOR = '#2bb8c4';
const POP_DOWN_COLOR = 'hsl(2, 82%, 63%)';

export function PopMarker({ pop }: { pop: RailwayPop }) {
  const color = pop.status === 'available' ? POP_COLOR : POP_DOWN_COLOR;

  return (
    <Marker longitude={pop.geo.lon} latitude={pop.geo.lat} anchor="center">
      <Box
        title={`${pop.name} (${pop.region}) · ${pop.status}`}
        width="7px"
        height="7px"
        borderRadius="full"
        bg={color}
        border="1px solid rgba(255, 255, 255, 0.7)"
        boxShadow={`0 0 6px ${color}`}
        opacity={0.85}
      />
    </Marker>
  );
}
