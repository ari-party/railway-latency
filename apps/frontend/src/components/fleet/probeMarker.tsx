import { Box } from '@chakra-ui/react';
import React from 'react';
import { Marker } from 'react-map-gl/maplibre';

import { STATUS_COLOR } from '@/components/fleet/probeStatus';

import type { ProbeMetadata } from '@railway-latency/types';

export function ProbeMarker({
  onHover,
  onSelect,
  probe,
  selected,
}: {
  onHover: (probe: ProbeMetadata | null) => void;
  onSelect: (probeId: string) => void;
  probe: ProbeMetadata;
  selected: boolean;
}) {
  const color = STATUS_COLOR[probe.status];

  return (
    <Marker
      longitude={probe.lon}
      latitude={probe.lat}
      anchor="center"
      onClick={(event) => {
        event.originalEvent.stopPropagation();
        onSelect(probe.probeId);
      }}
    >
      <Box
        position="relative"
        width="14px"
        height="14px"
        cursor="pointer"
        onMouseEnter={() => onHover(probe)}
        onMouseLeave={() => onHover(null)}
      >
        {probe.status === 'green' && (
          <Box
            position="absolute"
            top="50%"
            left="50%"
            width="14px"
            height="14px"
            borderRadius="full"
            bg={color}
            animation="probePulse 2.4s ease-out infinite"
          />
        )}

        {selected && (
          <Box
            position="absolute"
            top="50%"
            left="50%"
            width="26px"
            height="26px"
            borderRadius="full"
            border="2px solid"
            borderColor="accent"
            transform="translate(-50%, -50%)"
          />
        )}

        <Box
          position="absolute"
          top="50%"
          left="50%"
          width="11px"
          height="11px"
          borderRadius="full"
          bg={color}
          border="2px solid rgba(8, 8, 12, 0.65)"
          boxShadow={`0 0 8px ${color}`}
          transform="translate(-50%, -50%)"
          transition="transform 0.15s ease"
          _hover={{ transform: 'translate(-50%, -50%) scale(1.3)' }}
        />
      </Box>
    </Marker>
  );
}
