import { Box } from '@chakra-ui/react';
import React from 'react';

import type { ProbeStatus } from '@railway-latency/types';

export const STATUS_COLOR: Record<ProbeStatus, string> = {
  green: 'hsl(146, 64%, 50%)',
  stale: 'hsl(38, 92%, 56%)',
  down: 'hsl(2, 82%, 63%)',
  inactive: 'hsl(252, 7%, 58%)',
};

export const STATUS_LABEL: Record<ProbeStatus, string> = {
  green: 'Online',
  stale: 'Stale',
  down: 'Down',
  inactive: 'Inactive',
};

export function StatusDot({
  size = 8,
  status,
}: {
  size?: number;
  status: ProbeStatus;
}) {
  const color = STATUS_COLOR[status];
  return (
    <Box
      width={`${size}px`}
      height={`${size}px`}
      borderRadius="full"
      backgroundColor={color}
      boxShadow={`0 0 0 3px ${color}22`}
      flexShrink={0}
    />
  );
}
