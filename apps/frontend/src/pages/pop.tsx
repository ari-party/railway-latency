import {
  Box,
  ClientOnly,
  createListCollection,
  HStack,
  Stack,
  Text,
} from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import React, { Suspense } from 'react';

import { MetricsChartSkeleton } from '@/components/metrics/metricsChart';
import { PopLatencyChart } from '@/components/pop/popLatencyChart';
import { RangeSegmentGroup } from '@/components/querySegmentGroups';
import SimpleSelect from '@/components/select';
import { coerceRange, DEFAULT_RANGE } from '@/utils/query';
import { trpc } from '@/utils/trpc';

const ALL_REGIONS = 'all';

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

export default function PopLatency() {
  const [pops] = trpc.pops.list.useSuspenseQuery();
  const [regions] = trpc.regions.useSuspenseQuery();

  const [pop, setPop] = useQueryState('pop', { defaultValue: '' });
  const [dst, setDst] = useQueryState('dst', { defaultValue: ALL_REGIONS });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });

  const popList = pops ?? [];
  const validatedPop = popList.includes(pop) ? pop : (popList[0] ?? '');
  const validatedDst = regions.includes(dst) ? dst : null;
  const validatedRange = coerceRange(range);

  const popCollection = createListCollection({
    items: popList.map((entry) => ({ value: entry, label: entry })),
  });
  const dstCollection = createListCollection({
    items: [
      { value: ALL_REGIONS, label: 'All regions' },
      ...regions.map((region) => ({ value: region, label: region })),
    ],
  });

  return (
    <Stack height="100%" gap="0">
      <Box
        position="sticky"
        top="0"
        zIndex="docked"
        bg="bg.subtle"
        borderBottomWidth="1px"
        borderColor="border.muted"
        paddingX="6"
        paddingY="3"
      >
        <HStack
          gap="3"
          align="center"
          maxWidth="7xl"
          marginX="auto"
          width="100%"
          flexWrap="wrap"
        >
          <HStack gap="2">
            <FieldLabel>PoP</FieldLabel>
            <SimpleSelect
              width="200px"
              collection={popCollection}
              value={[validatedPop]}
              disabled={popList.length === 0}
              onValueChange={(details) => void setPop(details.value[0])}
            />
          </HStack>

          <HStack gap="2">
            <FieldLabel>Dst</FieldLabel>
            <SimpleSelect
              width="200px"
              collection={dstCollection}
              value={[validatedDst ?? ALL_REGIONS]}
              onValueChange={(details) => void setDst(details.value[0])}
            />
          </HStack>

          <RangeSegmentGroup
            value={validatedRange}
            onValueChange={(value) => void setRange(value)}
          />
        </HStack>
      </Box>

      <Box flex="1" overflow="auto" paddingX="6" paddingY="5">
        <Box maxWidth="7xl" marginX="auto">
          {pops == null ? (
            <Text color="fg.muted">PoP data is currently unavailable.</Text>
          ) : popList.length === 0 ? (
            <Text color="fg.muted">
              No public traffic through any Railway PoP in the last 24 hours.
            </Text>
          ) : (
            <Stack
              borderWidth="1px"
              borderColor="border.DEFAULT"
              borderRadius="xl"
              bg="bg.panel"
              padding="5"
              gap="4"
            >
              <Text fontWeight="medium">
                Public latency by {validatedDst ? 'probe' : 'region'} (p95)
              </Text>
              <ClientOnly fallback={<MetricsChartSkeleton />}>
                <Suspense fallback={<MetricsChartSkeleton />}>
                  <PopLatencyChart
                    dst={validatedDst}
                    pop={validatedPop}
                    range={validatedRange}
                  />
                </Suspense>
              </ClientOnly>
            </Stack>
          )}
        </Box>
      </Box>
    </Stack>
  );
}
