import { Badge } from '@chakra-ui/react';

import { DISPLAY_STATUS_LABEL, DISPLAY_STATUS_TONE } from '@/lib/status';

import type { DisplayStatus, StatusTone } from '@/lib/status';
import type { BadgeProps } from '@chakra-ui/react';

export const TONE_COLOR_PALETTE: Record<
  StatusTone,
  BadgeProps['colorPalette']
> = {
  green: 'green',
  amber: 'orange',
  red: 'red',
  neutral: 'gray',
  accent: 'purple',
};

interface StatusBadgeProps {
  status: DisplayStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <Badge
      variant="subtle"
      colorPalette={TONE_COLOR_PALETTE[DISPLAY_STATUS_TONE[status]]}
    >
      {DISPLAY_STATUS_LABEL[status]}
    </Badge>
  );
}
