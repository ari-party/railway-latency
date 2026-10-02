import { Box, createListCollection, HStack, Stack, Text } from '@chakra-ui/react';
import { useRouter } from 'next/router';
import { useQueryState } from 'nuqs';
import React from 'react';

import { RangeSegmentGroup } from '@/components/querySegmentGroups';
import SimpleSelect from '@/components/select';
import { coerceRange, DEFAULT_RANGE } from '@/utils/query';

import type { FrontendRange } from '@/utils/query';
import type { UrlObject } from 'url';

const ALL_POPS = 'all';
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

export function usePopHref(): (pop: string | null) => UrlObject {
  const { query } = useRouter();

  return React.useCallback(
    (pop) => {
      const { pop: _pop, ...rest } = query;
      return pop == null
        ? { pathname: '/pop', query: rest }
        : { pathname: '/pop/[pop]', query: { ...rest, pop } };
    },
    [query],
  );
}

export function PopPageLayout({
  children,
  pop,
  pops,
  regions,
}: {
  children: (filters: {
    dst: string | null;
    range: FrontendRange;
  }) => React.ReactNode;
  pop: string | null;
  pops: string[];
  regions: string[];
}) {
  const router = useRouter();
  const popHref = usePopHref();

  const [dst, setDst] = useQueryState('dst', { defaultValue: ALL_REGIONS });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });

  const validatedDst = regions.includes(dst) ? dst : null;
  const validatedRange = coerceRange(range);

  const popOptions = pop != null && !pops.includes(pop) ? [pop, ...pops] : pops;
  const popCollection = createListCollection({
    items: [
      { value: ALL_POPS, label: 'All PoPs' },
      ...popOptions.map((entry) => ({ value: entry, label: entry })),
    ],
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
        <HStack gap="3" align="center" width="100%" flexWrap="wrap">
          <HStack gap="2">
            <FieldLabel>PoP</FieldLabel>
            <SimpleSelect
              width="200px"
              collection={popCollection}
              value={[pop ?? ALL_POPS]}
              disabled={popOptions.length === 0}
              onValueChange={(details) => {
                const next = details.value[0];
                void router.push(popHref(next === ALL_POPS ? null : next));
              }}
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
        {children({ dst: validatedDst, range: validatedRange })}
      </Box>
    </Stack>
  );
}
