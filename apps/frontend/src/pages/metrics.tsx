import { Box, ClientOnly, Stack } from '@chakra-ui/react';
import { useQueryState } from 'nuqs';
import { Suspense } from 'react';

import { FleetCharts } from '@/components/metrics/fleetCharts';
import { MetricsChartSkeleton } from '@/components/metrics/metricsChart';
import {
  NetworkSegmentGroup,
  RangeSegmentGroup,
} from '@/components/querySegmentGroups';
import { coerceNetwork, coerceRange, DEFAULT_RANGE } from '@/utils/query';

export default function Metrics() {
  const [range, setRange] = useQueryState('range', {
    defaultValue: DEFAULT_RANGE,
  });
  const [network, setNetwork] = useQueryState('network', {
    defaultValue: 'private',
  });
  const validatedRange = coerceRange(range);
  const validatedNetwork = coerceNetwork(network);

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
        <Stack
          direction="row"
          gap="3"
          align="center"
          maxWidth="7xl"
          marginX="auto"
          width="100%"
        >
          <NetworkSegmentGroup
            value={validatedNetwork}
            onValueChange={(value) => void setNetwork(value)}
          />
          <RangeSegmentGroup
            value={validatedRange}
            onValueChange={(value) => void setRange(value)}
          />
        </Stack>
      </Box>
      <Box flex="1" overflow="auto" paddingX="6" paddingY="5">
        <Box maxWidth="7xl" marginX="auto">
          <ClientOnly fallback={<MetricsChartSkeleton />}>
            <Suspense fallback={<MetricsChartSkeleton />}>
              <FleetCharts range={validatedRange} network={validatedNetwork} />
            </Suspense>
          </ClientOnly>
        </Box>
      </Box>
    </Stack>
  );
}
