import { SimpleGrid, Stack, Text } from '@chakra-ui/react';
import React from 'react';

import { MetricsChart } from '@/components/metrics/metricsChart';
import { computeAdaptiveYMax } from '@/utils/chartScale';
import { formatNumber as createNumberFormatter } from '@/utils/format';
import { trpc } from '@/utils/trpc';

import type { MetricsSeries } from '@/components/metrics/metricsChart';
import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';

const LIVE_REFETCH_INTERVAL_MS = 2500;

const formatMs = createNumberFormatter({ maximumFractionDigits: 1 });
const formatPercent = createNumberFormatter({ maximumFractionDigits: 2 });

const formatLatency = (value: number) => `${formatMs(value)} ms`;
const formatRate = (value: number) => `${formatPercent(value)}%`;

function rate(numerator: number, total: number): number | null {
  return total > 0 ? (numerator / total) * 100 : null;
}

function ChartPanel({
  children,
  description,
  title,
}: {
  children: React.ReactNode;
  description: string;
  title: string;
}) {
  return (
    <Stack
      borderWidth="1px"
      borderColor="border.DEFAULT"
      borderRadius="xl"
      bg="bg.panel"
      padding="5"
      gap="4"
    >
      <Stack gap="1">
        <Text fontWeight="medium">{title}</Text>
        <Text fontSize="sm" color="fg.muted">
          {description}
        </Text>
      </Stack>
      {children}
    </Stack>
  );
}

export function FleetCharts({
  network,
  range,
}: {
  network: Network;
  range: FrontendRange;
}) {
  const refetchInterval = range === 'live' ? LIVE_REFETCH_INTERVAL_MS : false;

  const [points] = trpc.metrics.fleet.useSuspenseQuery(
    { range, network },
    { refetchInterval },
  );

  const latencySeries = React.useMemo<MetricsSeries[]>(
    () => [
      {
        name: 'p50',
        colorToken: 'blue.400',
        data: (points ?? []).map((point) => [point.bucketMs, point.p50]),
      },
      {
        name: 'p95',
        colorToken: 'violet.400',
        data: (points ?? []).map((point) => [point.bucketMs, point.p95]),
      },
      {
        name: 'p99',
        colorToken: 'pink.400',
        data: (points ?? []).map((point) => [point.bucketMs, point.p99]),
      },
    ],
    [points],
  );

  const latencyYMax = React.useMemo(
    () =>
      computeAdaptiveYMax(
        latencySeries.flatMap((series) =>
          series.data
            .map(([, value]) => value)
            .filter((value): value is number => value != null),
        ),
      ),
    [latencySeries],
  );

  const errorRateSeries = React.useMemo<MetricsSeries[]>(
    () => [
      {
        name: 'Error rate',
        colorToken: 'red.400',
        data: (points ?? []).map((point) => [
          point.bucketMs,
          rate(point.errors, point.total),
        ]),
      },
    ],
    [points],
  );

  const failureRateSeries = React.useMemo<MetricsSeries[]>(
    () => [
      {
        name: 'Failure rate',
        colorToken: 'orange.400',
        data: (points ?? []).map((point) => [
          point.bucketMs,
          rate(point.failures, point.total),
        ]),
      },
    ],
    [points],
  );

  if (points == null)
    return (
      <Text color="fg.muted">Fleet metrics are currently unavailable.</Text>
    );

  return (
    <Stack gap="5">
      <ChartPanel
        title="Request latency"
        description="HTTP response time across every region. The p50 line is the typical request; p95/p99 isolate the slow tail, where an individual probe's own network shows up."
      >
        <MetricsChart
          series={latencySeries}
          range={range}
          formatValue={formatLatency}
          yMax={latencyYMax}
        />
      </ChartPanel>
      <SimpleGrid columns={{ base: 1, xl: 2 }} gap="5">
        <ChartPanel
          title="Error rate (≥400)"
          description="Share of all requests that completed but returned an HTTP status of 400 or above."
        >
          <MetricsChart
            series={errorRateSeries}
            range={range}
            formatValue={formatRate}
          />
        </ChartPanel>
        <ChartPanel
          title="Connection failure rate"
          description="Share of all checks that never reached an HTTP response, failing at the DNS, handshake, or HTTP stage."
        >
          <MetricsChart
            series={failureRateSeries}
            range={range}
            formatValue={formatRate}
          />
        </ChartPanel>
      </SimpleGrid>
    </Stack>
  );
}
