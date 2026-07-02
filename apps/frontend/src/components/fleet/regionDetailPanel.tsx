import { Box, Flex, HStack, IconButton, Stack, Text } from '@chakra-ui/react';
import React from 'react';
import { LuMaximize2, LuMinimize2, LuX } from 'react-icons/lu';

import { DestinationGrid } from '@/components/destinationGrid';
import { REGION_COLOR } from '@/components/fleet/regionMarker';
import { PairDetail } from '@/components/pairDetail';
import {
  NetworkSegmentGroup,
  RangeSegmentGroup,
} from '@/components/querySegmentGroups';
import { RefreshButton } from '@/components/refreshButton';
import { trpc } from '@/utils/trpc';

import type { RailwayMarker } from '@/components/map/markers';
import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';

export function RegionDetailPanel({
  focusedDst,
  network,
  onClose,
  railwayRegions,
  range,
  region,
  setDst,
  setNet,
  setRange,
}: {
  focusedDst: string | null;
  network: Network;
  onClose: () => void;
  railwayRegions: string[];
  range: FrontendRange;
  region: RailwayMarker;
  setDst: (dst: string) => void;
  setNet: (network: string) => void;
  setRange: (range: string | null) => void;
}) {
  const utils = trpc.useUtils();
  const [maximized, setMaximized] = React.useState(false);

  return (
    <Stack
      position="absolute"
      top="0"
      right="0"
      bottom="0"
      zIndex={10}
      width={maximized ? '100%' : { base: '100%', md: 'min(640px, 46vw)' }}
      minHeight="0"
      gap="0"
      borderLeftWidth="1px"
      borderColor="border.muted"
      bg="bg.subtle"
      boxShadow="-16px 0 40px rgba(0, 0, 0, 0.5)"
      transition="width 0.25s ease"
    >
      <Flex
        align="center"
        gap="2.5"
        paddingX="4"
        paddingY="3"
        borderBottomWidth="1px"
        borderColor="border.muted"
      >
        <HStack gap="1" flexShrink={0}>
          <IconButton
            size="sm"
            variant="ghost"
            color="fg.muted"
            aria-label={maximized ? 'Restore panel' : 'Maximize panel'}
            _hover={{ color: 'fg', bg: 'bg.emphasized' }}
            onClick={() => setMaximized((value) => !value)}
          >
            {maximized ? <LuMinimize2 /> : <LuMaximize2 />}
          </IconButton>
          <IconButton
            size="sm"
            variant="ghost"
            color="fg.muted"
            aria-label="Close panel"
            _hover={{ color: 'fg', bg: 'bg.emphasized' }}
            onClick={onClose}
          >
            <LuX />
          </IconButton>
        </HStack>

        <HStack gap="2.5" minWidth="0">
          <Box
            width="9px"
            height="9px"
            borderRadius="full"
            flexShrink={0}
            backgroundColor={REGION_COLOR}
          />
          <Stack gap="0" minWidth="0">
            <Text fontFamily="mono" fontWeight="semibold" color="fg" truncate>
              {region.region}
            </Text>
            <Text fontSize="xs" color="fg.muted" truncate>
              Railway region
            </Text>
          </Stack>
        </HStack>
      </Flex>

      <HStack
        gap="2"
        flexWrap="wrap"
        justify="flex-end"
        paddingX="5"
        paddingY="3"
        borderBottomWidth="1px"
        borderColor="border.muted"
      >
        <RangeSegmentGroup value={range} onValueChange={setRange} />
        <NetworkSegmentGroup
          value={network}
          options={['public', 'proxied'] as const}
          onValueChange={setNet}
        />
        <RefreshButton
          disabled={range === 'live'}
          onClick={() => range !== 'live' && utils.chart.query.invalidate()}
        />
      </HStack>

      <Box
        flex="1"
        minHeight="0"
        overflowY="auto"
        overflowX="hidden"
        paddingX="5"
        paddingY="4"
      >
        {focusedDst ? (
          <PairDetail
            src={region.region}
            dst={focusedDst}
            network={network}
            range={range}
            onBack={() => setDst('')}
          />
        ) : (
          <DestinationGrid
            src={region.region}
            destinations={railwayRegions}
            network={network}
            range={range}
            singleColumn={!maximized}
            onFocus={setDst}
          />
        )}
      </Box>
    </Stack>
  );
}
