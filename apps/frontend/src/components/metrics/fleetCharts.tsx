import { Box, HStack, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import React from 'react';
import { LuInfo } from 'react-icons/lu';

import { MetricsChart } from '@/components/metrics/metricsChart';
import { Tooltip } from '@/components/ui/tooltip';
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

const STATUS_COLOR_TOKENS = [
  'red.400',
  'amber.400',
  'pink.400',
  'violet.400',
  'blue.400',
  'teal.400',
];

function rate(numerator: number, total: number): number | null {
  return total > 0 ? (numerator / total) * 100 : null;
}

function sortedErrorStatuses(
  points: { errorCounts: Record<string, number> }[],
) {
  const statuses = new Set<string>();
  for (const point of points)
    for (const [status, count] of Object.entries(point.errorCounts))
      if (count > 0) statuses.add(status);

  return [...statuses].sort((left, right) => Number(left) - Number(right));
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
      <HStack gap="1.5">
        <Text fontWeight="medium">{title}</Text>
        <Tooltip
          content={description}
          openDelay={200}
          closeDelay={100}
          positioning={{ placement: 'top' }}
          contentProps={{ maxWidth: '16rem' }}
          showArrow
        >
          <Box
            as="span"
            display="inline-flex"
            color="fg.subtle"
            cursor="help"
            _hover={{ color: 'fg.muted' }}
          >
            <LuInfo size={14} />
          </Box>
        </Tooltip>
      </HStack>
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
    () =>
      sortedErrorStatuses(points ?? []).map((status, index) => ({
        name: status,
        colorToken:
          STATUS_COLOR_TOKENS[index % STATUS_COLOR_TOKENS.length] ?? 'red.400',
        data: (points ?? []).map((point) => [
          point.bucketMs,
          rate(point.errorCounts[status] ?? 0, point.completed),
        ]),
      })),
    [points],
  );

  const failureRateSeries = React.useMemo<MetricsSeries[]>(
    () => [
      {
        name: 'DNS',
        colorToken: 'pink.400',
        data: (points ?? []).map((point) => [
          point.bucketMs,
          rate(point.failDns, point.total),
        ]),
      },
      {
        name: 'Handshake',
        colorToken: 'teal.400',
        data: (points ?? []).map((point) => [
          point.bucketMs,
          rate(point.failHandshake, point.total),
        ]),
      },
      {
        name: 'HTTP',
        colorToken: 'blue.400',
        data: (points ?? []).map((point) => [
          point.bucketMs,
          rate(point.failHttp, point.total),
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
          description="Share of all requests that completed but returned an HTTP status of 400 or above, split by status code."
        >
          <MetricsChart
            series={errorRateSeries}
            range={range}
            formatValue={formatRate}
          />
        </ChartPanel>
        <ChartPanel
          title="Connection failure rate"
          description="Share of all checks that never returned an HTTP response, split by the stage where the connection failed."
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
