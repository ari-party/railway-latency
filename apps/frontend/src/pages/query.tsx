import {
  Center,
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

export default function Query() {
  const utils = trpc.useUtils();
  const [regions] = trpc.regions.useSuspenseQuery();

  const [src, setSrc] = useQueryState('src', { defaultValue: regions[0] });
  const [dst, setDst] = useQueryState('dst', { defaultValue: regions[1] });
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const [net, setNet] = useQueryState('net', { defaultValue: 'private' });

  const network = coerceNetwork(net);

  const { validatedDst, validatedSrc } = React.useMemo(() => {
    if (regions.length === 0) return { validatedDst: '', validatedSrc: '' };

    const fallbackSrc = regions[0];
    const fallbackDst =
      regions.find((region) => region !== fallbackSrc) ?? fallbackSrc;

    const nextSrc = regions.includes(src) ? src : fallbackSrc;
    const nextDst = regions.includes(dst) ? dst : fallbackDst;

    return { validatedDst: nextDst, validatedSrc: nextSrc };
  }, [src, dst, regions]);

  const srcCollection = createListCollection({
    items: regions.map((region) => ({ value: region, label: region })),
  });
  const dstCollection = createListCollection({
    items: regions.map((region) => ({ value: region, label: region })),
  });
  const validatedRange = coerceRange(range);

  return (
    <Center height="100svh">
      <Stack width="100%" maxWidth="4xl">
        <HStack gap={2}>
          <RangeSegmentGroup value={validatedRange} onValueChange={setRange} />

          <NetworkSegmentGroup value={network} onValueChange={setNet} />

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
                network,
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
                network={network}
                range={validatedRange}
              />
            </Suspense>
          </ClientOnly>
        </Stack>
      </Stack>
    </Center>
  );
}
