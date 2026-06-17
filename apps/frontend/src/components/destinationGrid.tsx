import { ClientOnly, Grid, Skeleton } from '@chakra-ui/react';
import React, { Suspense } from 'react';

import { DestinationCard } from '@/components/destinationCard';
import { QueryResultChart } from '@/components/queryResultChart';
import { RANGE_WINDOW_MS } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';
import type { Range } from '@railway-latency/utils';

const LIVE_REFETCH_INTERVAL_MS = 2500;

function CardSkeleton() {
  return <Skeleton borderRadius="xl" height="392px" bg="bg.subtle" />;
}

function DestinationCardLoader({
  dst,
  network,
  onOpen,
  range,
  src,
}: {
  dst: string;
  network: Network;
  onOpen: () => void;
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

  const chartRange: Range = isLive ? '15m' : range;

  return (
    <DestinationCard dst={dst} onOpen={onOpen}>
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
  singleColumn = false,
  src,
}: {
  destinations: string[];
  network: Network;
  onFocus: (dst: string) => void;
  range: FrontendRange;
  singleColumn?: boolean;
  src: string;
}) {
  return (
    <Grid
      templateColumns={
        singleColumn
          ? 'minmax(0, 1fr)'
          : { base: 'minmax(0, 1fr)', md: 'minmax(0, 1fr) minmax(0, 1fr)' }
      }
      gap="4"
    >
      {destinations.map((dst) => (
        <ClientOnly key={dst} fallback={<CardSkeleton />}>
          <Suspense fallback={<CardSkeleton />}>
            <DestinationCardLoader
              dst={dst}
              src={src}
              network={network}
              range={range}
              onOpen={() => onFocus(dst)}
            />
          </Suspense>
        </ClientOnly>
      ))}
    </Grid>
  );
}
