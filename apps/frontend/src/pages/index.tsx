import {
  Box,
  createListCollection,
  HStack,
  IconButton,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import React from 'react';
import { VscRefresh } from 'react-icons/vsc';

import { DestinationGrid } from '@/components/destinationGrid';
import { PairDetail } from '@/components/pairDetail';
import {
  NetworkSegmentGroup,
  RangeSegmentGroup,
} from '@/components/querySegmentGroups';
import SimpleSelect from '@/components/select';
import { coerceNetwork, coerceRange, DEFAULT_RANGE } from '@/utils/query';
import { trpc } from '@/utils/trpc';

const ALL_DESTINATIONS = 'all';

export default function Explore() {
  const utils = trpc.useUtils();
  const [regions] = trpc.regions.useSuspenseQuery();

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
  const validatedSrc = regions.includes(src) ? src : (regions[0] ?? '');
  const focusedDst = regions.includes(dst) ? dst : null;

  const srcCollection = createListCollection({
    items: regions.map((region) => ({ value: region, label: region })),
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
          <NetworkSegmentGroup value={network} onValueChange={setNet} />

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
            network={network}
            range={validatedRange}
          />
        ) : (
          <DestinationGrid
            src={validatedSrc}
            destinations={regions}
            network={network}
            range={validatedRange}
            onFocus={(destination) => setDst(destination)}
          />
        )}
      </Stack>
    </Box>
  );
}
