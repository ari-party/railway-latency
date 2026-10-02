import { Flex, Grid, Skeleton, Text } from '@chakra-ui/react';
import React from 'react';

import { DestinationCard } from '@/components/destinationCard';
import { MetricsChart } from '@/components/metrics/metricsChart';
import { formatLatency } from '@/components/pop/popLatencyChart';
import { formatRequests } from '@/components/pop/popVolumeChart';
import { computeAdaptiveYMax } from '@/utils/chartScale';
import { trpc } from '@/utils/trpc';

import type { MetricsSeries } from '@/components/metrics/metricsChart';
import type { PopOverviewPoint } from '@/server/api/trpc/routers/pops';
import type { FrontendRange } from '@/utils/query';

const LIVE_REFETCH_INTERVAL_MS = 2500;
const CARD_CHART_HEIGHT_PX = 200;

const POP_GRID_COLUMNS =
  'repeat(auto-fill, minmax(min(100%, 380px), 1fr))';

const VOLUME_AXIS = { formatValue: formatRequests };

function PopOverviewCardSkeleton() {
  return <Skeleton borderRadius="xl" height="262px" bg="bg.subtle" />;
}

export function PopOverviewGridSkeleton({ count }: { count: number }) {
  return (
    <Grid
      templateColumns={POP_GRID_COLUMNS}
      gap="4"
    >
      {Array.from({ length: count }, (_, index) => (
        <PopOverviewCardSkeleton key={index} />
      ))}
    </Grid>
  );
}

function PopOverviewCard({
  onOpen,
  points,
  pop,
  range,
}: {
  onOpen: () => void;
  points: PopOverviewPoint[];
  pop: string;
  range: FrontendRange;
}) {
  const series = React.useMemo<MetricsSeries[]>(
    () => [
      {
        name: 'Requests',
        colorToken: 'gray.400',
        type: 'bar',
        axis: 'secondary',
        data: points.map((point) => [point.bucketMs, point.count]),
      },
      {
        name: 'p99 latency',
        colorToken: 'blue.400',
        data: points.map((point) => [point.bucketMs, point.p99]),
      },
    ],
    [points],
  );

  const yMax = React.useMemo(
    () =>
      computeAdaptiveYMax(
        points
          .map((point) => point.p99)
          .filter((value): value is number => value != null),
      ),
    [points],
  );

  return (
    <DestinationCard label={pop} onOpen={onOpen}>
      {points.length === 0 ? (
        <Flex
          height={`${CARD_CHART_HEIGHT_PX}px`}
          align="center"
          justify="center"
        >
          <Text color="fg.muted" fontSize="sm">
            No public traffic in the selected range.
          </Text>
        </Flex>
      ) : (
        <MetricsChart
          series={series}
          range={range}
          formatValue={formatLatency}
          secondaryAxis={VOLUME_AXIS}
          yMax={yMax}
          height={CARD_CHART_HEIGHT_PX}
        />
      )}
    </DestinationCard>
  );
}

export function PopOverviewGrid({
  dst,
  onFocus,
  pops,
  range,
}: {
  dst: string | null;
  onFocus: (pop: string) => void;
  pops: string[];
  range: FrontendRange;
}) {
  const refetchInterval = range === 'live' ? LIVE_REFETCH_INTERVAL_MS : false;

  const [points] = trpc.pops.overview.useSuspenseQuery(
    { dst, range },
    { refetchInterval },
  );

  const pointsByPop = React.useMemo(() => {
    const byPop = new Map<string, PopOverviewPoint[]>();
    for (const point of points ?? []) {
      const entries = byPop.get(point.pop) ?? [];
      entries.push(point);
      byPop.set(point.pop, entries);
    }
    return byPop;
  }, [points]);

  const orderedPops = React.useMemo(() => {
    const known = new Set(pops);
    const extra = [...pointsByPop.keys()]
      .filter((pop) => !known.has(pop))
      .sort();
    return [...pops, ...extra];
  }, [pops, pointsByPop]);

  if (points == null)
    return <Text color="fg.muted">PoP data is currently unavailable.</Text>;

  return (
    <Grid
      templateColumns={POP_GRID_COLUMNS}
      gap="4"
    >
      {orderedPops.map((pop) => (
        <PopOverviewCard
          key={pop}
          pop={pop}
          points={pointsByPop.get(pop) ?? []}
          range={range}
          onOpen={() => onFocus(pop)}
        />
      ))}
    </Grid>
  );
}
