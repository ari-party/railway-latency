import { Text } from '@chakra-ui/react';
import React from 'react';

import { MetricsChart } from '@/components/metrics/metricsChart';
import { computeAdaptiveYMax } from '@/utils/chartScale';
import { formatNumber as createNumberFormatter } from '@/utils/format';
import { trpc } from '@/utils/trpc';

import type { MetricsSeries } from '@/components/metrics/metricsChart';
import type { FrontendRange } from '@/utils/query';

const LIVE_REFETCH_INTERVAL_MS = 2500;

// Order matters: adjacent hues must stay distinguishable — do not sort.
const PROBE_COLOR_TOKENS = [
  'blue.400',
  'amber.400',
  'teal.400',
  'pink.400',
  'green.400',
  'red.400',
  'violet.400',
];

const formatMs = createNumberFormatter({ maximumFractionDigits: 1 });
const formatLatency = (value: number) => `${formatMs(value)} ms`;

export function PopLatencyChart({
  dst,
  pop,
  range,
}: {
  dst: string | null;
  pop: string;
  range: FrontendRange;
}) {
  const refetchInterval = range === 'live' ? LIVE_REFETCH_INTERVAL_MS : false;

  const [points] = trpc.pops.latency.useSuspenseQuery(
    { pop, dst, range },
    { refetchInterval },
  );

  const series = React.useMemo<MetricsSeries[]>(() => {
    if (points == null) return [];

    const byProbe = new Map<string, Array<[number, number | null]>>();
    for (const point of points) {
      const data = byProbe.get(point.probe) ?? [];
      data.push([point.bucketMs, point.p50]);
      byProbe.set(point.probe, data);
    }

    return [...byProbe.keys()].sort().map((probe, index) => ({
      name: probe,
      colorToken: PROBE_COLOR_TOKENS[index % PROBE_COLOR_TOKENS.length],
      data: byProbe.get(probe)!,
    }));
  }, [points]);

  const yMax = React.useMemo(
    () =>
      computeAdaptiveYMax(
        series.flatMap((entry) =>
          entry.data
            .map(([, value]) => value)
            .filter((value): value is number => value != null),
        ),
      ),
    [series],
  );

  if (points == null)
    return <Text color="fg.muted">PoP latency is currently unavailable.</Text>;

  if (series.length === 0)
    return (
      <Text color="fg.muted">
        No public traffic through this PoP in the selected range.
      </Text>
    );

  return (
    <MetricsChart
      series={series}
      range={range}
      formatValue={formatLatency}
      yMax={yMax}
    />
  );
}
