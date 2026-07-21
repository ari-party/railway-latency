import { Text } from '@chakra-ui/react';
import React from 'react';

import { MetricsChart } from '@/components/metrics/metricsChart';
import { formatNumber as createNumberFormatter } from '@/utils/format';
import { trpc } from '@/utils/trpc';

import type { MetricsSeries } from '@/components/metrics/metricsChart';
import type { FrontendRange } from '@/utils/query';

const LIVE_REFETCH_INTERVAL_MS = 2500;

const SERIES_COLOR_TOKENS = [
  'blue.400',
  'amber.400',
  'teal.400',
  'pink.400',
  'green.400',
  'red.400',
  'violet.400',
];

const formatCount = createNumberFormatter({ maximumFractionDigits: 0 });
const formatRequests = (value: number) =>
  `${formatCount(value)} req${value === 1 ? '' : 's'}`;

export function PopVolumeChart({
  dst,
  pop,
  range,
}: {
  dst: string | null;
  pop: string;
  range: FrontendRange;
}) {
  const refetchInterval = range === 'live' ? LIVE_REFETCH_INTERVAL_MS : false;

  const [points] = trpc.pops.volume.useSuspenseQuery(
    { pop, dst, range },
    { refetchInterval },
  );

  const series = React.useMemo<MetricsSeries[]>(() => {
    if (points == null) return [];

    const byName = new Map<string, Array<[number, number | null]>>();
    for (const point of points) {
      const data = byName.get(point.series) ?? [];
      data.push([point.bucketMs, point.count]);
      byName.set(point.series, data);
    }

    return [...byName.keys()].sort().map((name, index) => ({
      name,
      colorToken: SERIES_COLOR_TOKENS[index % SERIES_COLOR_TOKENS.length],
      data: byName.get(name)!,
    }));
  }, [points]);

  if (points == null)
    return <Text color="fg.muted">PoP volume is currently unavailable.</Text>;

  if (series.length === 0)
    return (
      <Text color="fg.muted">
        No public traffic through this PoP in the selected range.
      </Text>
    );

  return (
    <MetricsChart series={series} range={range} formatValue={formatRequests} />
  );
}
