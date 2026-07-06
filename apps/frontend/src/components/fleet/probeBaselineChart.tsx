import { Text } from '@chakra-ui/react';
import React from 'react';

import { QueryResultChart } from '@/components/queryResultChart';
import { RANGE_WINDOW_MS } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/utils/query';
import type { Range } from '@railway-latency/utils';

const LIVE_REFETCH_INTERVAL_MS = 2500;

export function ProbeBaselineChart({
  range,
  src,
}: {
  range: FrontendRange;
  src: string;
}) {
  const isLive = range === 'live';
  const [lines] = trpc.chart.baseline.useSuspenseQuery(
    { src, range },
    { refetchInterval: isLive ? LIVE_REFETCH_INTERVAL_MS : false },
  );

  if (!lines || lines.length === 0)
    return (
      <Text fontSize="sm" color="fg.muted">
        No baseline data for this probe.
      </Text>
    );

  const chartRange: Range = isLive ? '15m' : range;

  return (
    <QueryResultChart
      lines={lines}
      errors={[]}
      windowMs={RANGE_WINDOW_MS[range]}
      range={chartRange}
    />
  );
}
