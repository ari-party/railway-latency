import {
  Box,
  ClientOnly,
  Flex,
  HStack,
  IconButton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { cityNameFromProbeId } from '@railway-latency/utils';
import React, { Suspense } from 'react';
import { LuMaximize2, LuMinimize2, LuX } from 'react-icons/lu';

import { DestinationGrid } from '@/components/destinationGrid';
import { ProbeBaselineChart } from '@/components/fleet/probeBaselineChart';
import { StatusDot } from '@/components/fleet/probeStatus';
import { PairDetail } from '@/components/pairDetail';
import { QueryResultChartSkeleton } from '@/components/queryResultChart';
import {
  NetworkSegmentGroup,
  RangeSegmentGroup,
} from '@/components/querySegmentGroups';
import { RefreshButton } from '@/components/refreshButton';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/utils/query';
import type { Network, ProbeMetadata } from '@railway-latency/types';

export function ProbeDetailPanel({
  focusedDst,
  network,
  onClose,
  probe,
  railwayRegions,
  range,
  setDst,
  setNet,
  setRange,
}: {
  focusedDst: string | null;
  network: Network;
  onClose: () => void;
  probe: ProbeMetadata;
  railwayRegions: string[];
  range: FrontendRange;
  setDst: (dst: string) => void;
  setNet: (network: string) => void;
  setRange: (range: string | null) => void;
}) {
  const utils = trpc.useUtils();
  const city = cityNameFromProbeId(probe.probeId);
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
          <StatusDot status={probe.status} size={9} />
          <Stack gap="0" minWidth="0">
            <Text fontFamily="mono" fontWeight="semibold" color="fg" truncate>
              {probe.probeId}
            </Text>
            {city && (
              <Text fontSize="xs" color="fg.muted" truncate>
                {city}
              </Text>
            )}
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
        <Stack
          marginBottom="4"
          borderWidth="1px"
          borderColor="border.DEFAULT"
          borderRadius="xl"
          bg="bg.panel"
          padding="4"
          gap="3"
        >
          <Text fontFamily="mono" fontWeight="semibold" fontSize="sm">
            Baseline
          </Text>
          <ClientOnly fallback={<QueryResultChartSkeleton />}>
            <Suspense fallback={<QueryResultChartSkeleton />}>
              <ProbeBaselineChart src={probe.probeId} range={range} />
            </Suspense>
          </ClientOnly>
        </Stack>

        {focusedDst ? (
          <PairDetail
            src={probe.probeId}
            dst={focusedDst}
            network={network}
            range={range}
            onBack={() => setDst('')}
          />
        ) : (
          <DestinationGrid
            src={probe.probeId}
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
