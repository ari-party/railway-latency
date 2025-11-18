import {
  Center,
  ClientOnly,
  createListCollection,
  Grid,
  HStack,
  IconButton,
  SegmentGroup,
  Stack,
  Text,
} from '@chakra-ui/react';
import { RANGES } from '@railway-latency/utils';
import { useQueryState } from 'nuqs';
import React, { Suspense } from 'react';
import { VscRefresh } from 'react-icons/vsc';

import { QueryChart } from '@/components/queryChart';
import { QueryResultChartSkeleton } from '@/components/queryResultChart';
import SimpleSelect from '@/components/select';
import { trpc } from '@/utils/trpc';

const DEFAULT_RANGE = '1h';
const FRONTEND_RANGES = ['live', ...RANGES] as const;
export type FrontendRange = (typeof FRONTEND_RANGES)[number];

export default function Query() {
  const utils = trpc.useUtils();
  const [regions] = trpc.regions.useSuspenseQuery();

  const [src, setSrc] = useQueryState('src', { defaultValue: regions[0] });
  const [dst, setDst] = useQueryState('dst', { defaultValue: regions[1] });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });

  const { validatedDst, validatedSrc } = React.useMemo(() => {
    if (regions.length === 0) return { validatedDst: '', validatedSrc: '' };

    const fallbackSrc = regions[0];
    const fallbackDst =
      regions.find((region) => region !== fallbackSrc) ?? fallbackSrc;

    const nextSrc = regions.includes(src) ? src : fallbackSrc;
    let nextDst = regions.includes(dst) ? dst : fallbackDst;

    if (nextSrc === nextDst) {
      const alternativeForDst = regions.find((region) => region !== nextSrc);
      if (alternativeForDst) nextDst = alternativeForDst;
    }

    return { validatedDst: nextDst, validatedSrc: nextSrc };
  }, [src, dst, regions]);

  const srcCollection = createListCollection({
    items: regions
      .filter((region) => regions.length <= 1 || region !== validatedDst)
      .map((region) => ({
        value: region,
        label: region,
      })),
  });
  const dstCollection = createListCollection({
    items: regions
      .filter((region) => regions.length <= 1 || region !== validatedSrc)
      .map((region) => ({
        value: region,
        label: region,
      })),
  });
  const validatedRange = React.useMemo<FrontendRange>(() => {
    const isRange = (v: unknown): v is FrontendRange =>
      typeof v === 'string' &&
      (FRONTEND_RANGES as readonly string[]).includes(v);
    return isRange(range) ? range : DEFAULT_RANGE;
  }, [range]);

  return (
    <Center height="100svh">
      <Stack width="100%" maxWidth="4xl">
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

          <Grid templateColumns="1fr 1fr" width="100%" gap={2}>
            <SimpleSelect
              collection={srcCollection}
              value={[validatedSrc]}
              onValueChange={(details) => setSrc(details.value[0])}
            />
            <SimpleSelect
              collection={dstCollection}
              value={[validatedDst]}
              onValueChange={(details) => setDst(details.value[0])}
            />
          </Grid>

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
              validatedRange !== 'live' &&
              utils.chart.query.invalidate({
                src: validatedSrc,
                dst: validatedDst,
                range: validatedRange,
              })
            }
          >
            <VscRefresh />
          </IconButton>
        </HStack>

        <Stack
          borderWidth="1px"
          borderColor="gray.200"
          borderRadius="lg"
          padding={4}
        >
          <Text as="h6" fontWeight={600} color="white">
            {validatedSrc} to {validatedDst}
          </Text>

          <ClientOnly fallback={<QueryResultChartSkeleton />}>
            <Suspense fallback={<QueryResultChartSkeleton />}>
              <QueryChart
                src={validatedSrc}
                dst={validatedDst}
                range={validatedRange}
              />
            </Suspense>
          </ClientOnly>
        </Stack>
      </Stack>
    </Center>
  );
}
