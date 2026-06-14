import { SegmentGroup } from '@chakra-ui/react';
import React from 'react';

import { FRONTEND_RANGES, NETWORKS } from '@/utils/query';

import type { Network } from '@railway-latency/types';

export function RangeSegmentGroup({
  onValueChange,
  value,
}: {
  value: string;
  onValueChange: (value: string | null) => void;
}) {
  return (
    <SegmentGroup.Root
      value={value}
      width="max-content"
      onValueChange={(details) => onValueChange(details.value)}
    >
      <SegmentGroup.Indicator />
      {FRONTEND_RANGES.map((range) => (
        <SegmentGroup.Item
          key={range}
          value={range}
          paddingInline={0}
          paddingX={3}
          paddingY={2}
        >
          <SegmentGroup.ItemText>
            {range === 'live' ? 'Live' : range}
          </SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}

export function NetworkSegmentGroup({
  onValueChange,
  value,
}: {
  value: Network;
  onValueChange: (value: string) => void;
}) {
  return (
    <SegmentGroup.Root
      value={value}
      width="max-content"
      onValueChange={(details) => details.value && onValueChange(details.value)}
    >
      <SegmentGroup.Indicator />
      {NETWORKS.map((option) => (
        <SegmentGroup.Item
          key={option}
          value={option}
          paddingInline={0}
          paddingX={3}
          paddingY={2}
        >
          <SegmentGroup.ItemText textTransform="capitalize">
            {option}
          </SegmentGroup.ItemText>
          <SegmentGroup.ItemHiddenInput />
        </SegmentGroup.Item>
      ))}
    </SegmentGroup.Root>
  );
}
