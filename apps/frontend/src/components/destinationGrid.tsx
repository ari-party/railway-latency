import {
  Box,
  ClientOnly,
  Grid,
  HStack,
  Skeleton,
  Text,
} from '@chakra-ui/react';
import React, { Suspense } from 'react';

import { DestinationCard } from '@/components/destinationCard';
import { QueryResultChart } from '@/components/queryResultChart';
import { deriveStatus } from '@/utils/anomaly';
import { RANGE_WINDOW_MS } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { AnomalyStatus } from '@/utils/anomaly';
import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';
import type { Range } from '@railway-latency/utils';

const LIVE_REFETCH_INTERVAL_MS = 2500;

function CardSkeleton() {
  return <Skeleton borderRadius="lg" height="380px" />;
}

function DestinationCardLoader({
  dst,
  network,
  onOpen,
  onSummary,
  range,
  src,
}: {
  dst: string;
  network: Network;
  onOpen: () => void;
  onSummary: (dst: string, status: AnomalyStatus) => void;
  range: FrontendRange;
  src: string;
}) {
  const isLive = range === 'live';
  const refetchInterval = isLive ? LIVE_REFETCH_INTERVAL_MS : false;

  const [lines] = trpc.chart.query.useSuspenseQuery(
    { src, dst, range, network },
    { refetchInterval },
  );
  const [errors] = trpc.chart.errors.useSuspenseQuery(
    { src, dst, range, network },
    { refetchInterval },
  );

  const status = React.useMemo(() => deriveStatus(lines ?? []), [lines]);

  React.useEffect(() => {
    onSummary(dst, status);
  }, [dst, status, onSummary]);

  const chartRange: Range = isLive ? '15m' : range;

  return (
    <DestinationCard dst={dst} status={status} onOpen={onOpen}>
      <QueryResultChart
        lines={lines ?? []}
        errors={errors ?? []}
        windowMs={RANGE_WINDOW_MS[range]}
        range={chartRange}
      />
    </DestinationCard>
  );
}

export function DestinationGrid({
  destinations,
  network,
  onFocus,
  range,
  src,
}: {
  destinations: string[];
  network: Network;
  onFocus: (dst: string) => void;
  range: FrontendRange;
  src: string;
}) {
  const [statuses, setStatuses] = React.useState<Record<string, AnomalyStatus>>(
    {},
  );

  const onSummary = React.useCallback((dst: string, status: AnomalyStatus) => {
    setStatuses((prev) =>
      prev[dst] === status ? prev : { ...prev, [dst]: status },
    );
  }, []);

  const anomalous = destinations.filter(
    (dst) => statuses[dst] && statuses[dst] !== 'ok',
  );

  return (
    <Box>
      {anomalous.length > 0 && (
        <HStack
          gap={2}
          marginBottom={3}
          padding={2}
          borderWidth="1px"
          borderColor="orange.300"
          borderRadius="md"
          flexWrap="wrap"
        >
          <Text fontSize="sm" color="orange.300">
            {anomalous.length} elevated:
          </Text>
          {anomalous.map((dst) => (
            <Text
              key={dst}
              as="button"
              fontSize="sm"
              color="orange.200"
              textDecoration="underline"
              onClick={() => onFocus(dst)}
            >
              {dst}
            </Text>
          ))}
        </HStack>
      )}

      <Grid templateColumns={{ base: '1fr', md: '1fr 1fr' }} gap={4}>
        {destinations.map((dst) => (
          <ClientOnly key={dst} fallback={<CardSkeleton />}>
            <Suspense fallback={<CardSkeleton />}>
              <DestinationCardLoader
                dst={dst}
                src={src}
                network={network}
                range={range}
                onOpen={() => onFocus(dst)}
                onSummary={onSummary}
              />
            </Suspense>
          </ClientOnly>
        ))}
      </Grid>
    </Box>
  );
}
