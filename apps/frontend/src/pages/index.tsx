import {
  Box,
  ClientOnly,
  createListCollection,
  Grid,
  HStack,
  IconButton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import React, { Suspense } from 'react';
import { VscRefresh } from 'react-icons/vsc';

import { QueryChart } from '@/components/queryChart';
import { QueryResultChartSkeleton } from '@/components/queryResultChart';
import {
  NetworkSegmentGroup,
  RangeSegmentGroup,
} from '@/components/querySegmentGroups';
import SimpleSelect from '@/components/select';
import { coerceNetwork, coerceRange, DEFAULT_RANGE } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';

const ALL_DESTINATIONS = 'all';

const PROBE_NETWORKS = [
  'public',
  'proxied',
] as const satisfies readonly Network[];

interface PairProps {
  src: string;
  dst: string;
  network: Network;
  range: FrontendRange;
}

function DestinationCard({
  dst,
  network,
  onOpen,
  range,
  src,
}: PairProps & { onOpen: () => void }) {
  return (
    <Stack
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      padding={4}
    >
      <Text
        as="span"
        alignSelf="flex-start"
        fontWeight={600}
        color="white"
        cursor="pointer"
        _hover={{ textDecoration: 'underline' }}
        onClick={onOpen}
      >
        {src} → {dst}
      </Text>

      <ClientOnly fallback={<QueryResultChartSkeleton />}>
        <Suspense fallback={<QueryResultChartSkeleton />}>
          <QueryChart src={src} dst={dst} network={network} range={range} />
        </Suspense>
      </ClientOnly>
    </Stack>
  );
}

function PairDetail({ dst, network, range, src }: PairProps) {
  return (
    <Stack
      borderWidth="1px"
      borderColor="gray.200"
      borderRadius="lg"
      padding={4}
    >
      <Text as="h6" fontWeight={600} color="white">
        {src} → {dst}
      </Text>

      <ClientOnly fallback={<QueryResultChartSkeleton />}>
        <Suspense fallback={<QueryResultChartSkeleton />}>
          <QueryChart src={src} dst={dst} network={network} range={range} />
        </Suspense>
      </ClientOnly>
    </Stack>
  );
}

export default function Explore() {
  const utils = trpc.useUtils();
  const [regions] = trpc.regions.useSuspenseQuery();
  const [probes] = trpc.probes.list.useSuspenseQuery();
  const probeIds = probes.map((probe) => probe.probeId);

  const [src, setSrc] = useQueryState('src', {
    defaultValue: regions[0] ?? '',
  });
  const [dst, setDst] = useQueryState('dst', {
    defaultValue: ALL_DESTINATIONS,
  });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const [net, setNet] = useQueryState('net', { defaultValue: 'private' });

  const network = coerceNetwork(net);
  const validatedRange = coerceRange(range);
  const validatedSrc =
    regions.includes(src) || probeIds.includes(src) ? src : (regions[0] ?? '');
  const isProbe = probeIds.includes(validatedSrc);
  const sourceNetwork: Network =
    isProbe && network === 'private' ? 'public' : network;
  const focusedDst = regions.includes(dst) ? dst : null;

  const srcCollection = createListCollection({
    items: [
      ...regions.map((region) => ({ value: region, label: region })),
      ...(isProbe ? [{ value: validatedSrc, label: validatedSrc }] : []),
    ],
  });
  const dstCollection = createListCollection({
    items: [
      { value: ALL_DESTINATIONS, label: 'All destinations' },
      ...regions.map((region) => ({ value: region, label: region })),
    ],
  });

  return (
    <Box height="100%" overflowY="auto">
      <Stack
        width="100%"
        maxWidth="6xl"
        marginX="auto"
        paddingX={4}
        paddingY={6}
        gap={4}
      >
        <HStack gap={2} flexWrap="wrap">
          <RangeSegmentGroup value={validatedRange} onValueChange={setRange} />

          <NetworkSegmentGroup
            value={sourceNetwork}
            options={isProbe ? PROBE_NETWORKS : undefined}
            onValueChange={setNet}
          />

          <HStack gap={2} flex="1" justifyContent="flex-end" flexWrap="wrap">
            <Text color="fg.muted" whiteSpace="nowrap">
              Source
            </Text>
            <SimpleSelect
              width="200px"
              collection={srcCollection}
              value={[validatedSrc]}
              onValueChange={(details) => setSrc(details.value[0])}
            />

            <Text color="fg.muted" whiteSpace="nowrap">
              Destination
            </Text>
            <SimpleSelect
              width="180px"
              collection={dstCollection}
              value={[focusedDst ?? ALL_DESTINATIONS]}
              onValueChange={(details) => setDst(details.value[0])}
            />

            <IconButton
              size="md"
              variant="outline"
              color="fg"
              borderColor="gray.200"
              aria-label="Refresh"
              disabled={validatedRange === 'live'}
              _hover={{ backgroundColor: 'gray.100' }}
              onClick={() =>
                validatedRange !== 'live' && utils.chart.query.invalidate()
              }
            >
              <VscRefresh />
            </IconButton>
          </HStack>
        </HStack>

        {regions.length === 0 ? (
          <Text color="fg.muted">No regions available.</Text>
        ) : focusedDst ? (
          <PairDetail
            src={validatedSrc}
            dst={focusedDst}
            network={sourceNetwork}
            range={validatedRange}
          />
        ) : (
          <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
            {regions.map((destination) => (
              <DestinationCard
                key={destination}
                src={validatedSrc}
                dst={destination}
                network={sourceNetwork}
                range={validatedRange}
                onOpen={() => setDst(destination)}
              />
            ))}
          </Grid>
        )}
      </Stack>
    </Box>
  );
}
