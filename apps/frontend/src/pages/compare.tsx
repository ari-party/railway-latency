import {
  ClientOnly,
  createListCollection,
  Grid,
  HStack,
  IconButton,
  Link as ChakraLink,
  SegmentGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import NextLink from 'next/link';
import { useQueryState } from 'nuqs';
import React, { Suspense } from 'react';
import { VscRefresh } from 'react-icons/vsc';

import { QueryChart } from '@/components/queryChart';
import { QueryResultChartSkeleton } from '@/components/queryResultChart';
import SimpleSelect from '@/components/select';
import {
  coerceNetwork,
  coerceRange,
  DEFAULT_RANGE,
  FRONTEND_RANGES,
  NETWORKS,
} from '@/utils/query';
import { trpc } from '@/utils/trpc';

export default function Compare() {
  const utils = trpc.useUtils();
  const [regions] = trpc.regions.useSuspenseQuery();

  const [src, setSrc] = useQueryState('src', { defaultValue: regions[0] });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const [net, setNet] = useQueryState('net', { defaultValue: 'private' });

  const network = coerceNetwork(net);

  const validatedSrc = regions.includes(src) ? src : (regions[0] ?? '');

  const destinations = regions;

  const srcCollection = createListCollection({
    items: regions.map((region) => ({ value: region, label: region })),
  });

  const validatedRange = coerceRange(range);

  return (
    <Stack width="100%" maxWidth="6xl" marginX="auto" paddingX={4} paddingY={8}>
      <HStack gap={2}>
        <SegmentGroup.Root
          value={validatedRange}
          width="max-content"
          onValueChange={(details) => setRange(details.value)}
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

        <SegmentGroup.Root
          value={network}
          width="max-content"
          onValueChange={(details) => details.value && setNet(details.value)}
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

        <HStack gap={2} flex="1" justifyContent="flex-end">
          <Text color="fg.muted" whiteSpace="nowrap">
            Source
          </Text>
          <SimpleSelect
            width="240px"
            collection={srcCollection}
            value={[validatedSrc]}
            onValueChange={(details) => setSrc(details.value[0])}
          />
        </HStack>

        <IconButton
          size="md"
          variant="outline"
          color="fg"
          borderColor="gray.200"
          disabled={validatedRange === 'live'}
          _hover={{
            backgroundColor: 'gray.100',
          }}
          onClick={() =>
            validatedRange !== 'live' && utils.chart.query.invalidate()
          }
        >
          <VscRefresh />
        </IconButton>
      </HStack>

      {destinations.length === 0 ? (
        <Text color="fg.muted">No regions to compare.</Text>
      ) : (
        <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
          {destinations.map((dst) => {
            const href = `/query?${new URLSearchParams({
              src: validatedSrc,
              dst,
              net: network,
              range: validatedRange,
            }).toString()}`;

            return (
              <Stack
                key={dst}
                borderWidth="1px"
                borderColor="gray.200"
                borderRadius="lg"
                padding={4}
              >
                <Text as="h6" fontWeight={600} color="white">
                  <ChakraLink
                    asChild
                    color="white"
                    _hover={{
                      color: 'pink.500',
                      textDecoration: 'underline',
                    }}
                  >
                    <NextLink href={href}>
                      {validatedSrc} to {dst}
                    </NextLink>
                  </ChakraLink>
                </Text>

                <ClientOnly fallback={<QueryResultChartSkeleton />}>
                  <Suspense fallback={<QueryResultChartSkeleton />}>
                    <QueryChart
                      src={validatedSrc}
                      dst={dst}
                      network={network}
                      range={validatedRange}
                    />
                  </Suspense>
                </ClientOnly>
              </Stack>
            );
          })}
        </Grid>
      )}
    </Stack>
  );
}
