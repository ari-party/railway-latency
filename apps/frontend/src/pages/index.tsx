import {
  Box,
  createListCollection,
  Flex,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import React from 'react';
import { LuArrowRight } from 'react-icons/lu';

import { DestinationGrid } from '@/components/destinationGrid';
import { PairDetail } from '@/components/pairDetail';
import {
  NetworkSegmentGroup,
  RangeSegmentGroup,
} from '@/components/querySegmentGroups';
import { RefreshButton } from '@/components/refreshButton';
import SimpleSelect from '@/components/select';
import { coerceNetwork, coerceRange, DEFAULT_RANGE } from '@/utils/query';
import { trpc } from '@/utils/trpc';

const ALL_DESTINATIONS = 'all';

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Text
      fontSize="2xs"
      fontWeight="semibold"
      letterSpacing="0.07em"
      textTransform="uppercase"
      color="fg.subtle"
      whiteSpace="nowrap"
    >
      {children}
    </Text>
  );
}

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
      <Box
        position="sticky"
        top="0"
        zIndex="docked"
        bg="bg"
        borderBottomWidth="1px"
        borderColor="border.muted"
      >
        <Flex
          width="100%"
          maxWidth="7xl"
          marginX="auto"
          paddingX="6"
          paddingY="3"
          align="center"
          justify="space-between"
          gap="4"
          flexWrap="wrap"
        >
          <HStack gap="3" flexWrap="wrap">
            <HStack gap="2">
              <FieldLabel>Src</FieldLabel>
              <SimpleSelect
                width="248px"
                collection={srcCollection}
                value={[validatedSrc]}
                onValueChange={(details) => setSrc(details.value[0])}
              />
            </HStack>

            <Box color="fg.subtle">
              <LuArrowRight size={16} />
            </Box>

            <HStack gap="2">
              <FieldLabel>Dst</FieldLabel>
              <SimpleSelect
                width="248px"
                collection={dstCollection}
                value={[focusedDst ?? ALL_DESTINATIONS]}
                onValueChange={(details) => setDst(details.value[0])}
              />
            </HStack>
          </HStack>

          <HStack gap="2" flexWrap="wrap">
            <RangeSegmentGroup
              value={validatedRange}
              onValueChange={setRange}
            />
            <NetworkSegmentGroup value={network} onValueChange={setNet} />

            <RefreshButton
              disabled={validatedRange === 'live'}
              onClick={() =>
                validatedRange !== 'live' && utils.chart.query.invalidate()
              }
            />
          </HStack>
        </Flex>
      </Box>

      <Stack
        width="100%"
        maxWidth="7xl"
        marginX="auto"
        paddingX="6"
        paddingY="6"
        gap="5"
      >
        {regions.length === 0 ? (
          <Text color="fg.muted">No regions available.</Text>
        ) : focusedDst ? (
          <PairDetail
            src={validatedSrc}
            dst={focusedDst}
            network={network}
            range={validatedRange}
            onBack={() => setDst(ALL_DESTINATIONS)}
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
