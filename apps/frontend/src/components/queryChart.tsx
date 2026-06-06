import React from 'react';

import { QueryResultChart } from '@/components/queryResultChart';
import { RANGE_WINDOW_MS } from '@/utils/query';
import { trpc } from '@/utils/trpc';

import type { FrontendRange } from '@/utils/query';
import type { Network } from '@railway-latency/types';
import type { Range } from '@railway-latency/utils';

const LIVE_REFETCH_INTERVAL_MS = 2500;

export function QueryChart({
  dst,
  network,
  range,
  src,
}: {
  dst: string;
  network: Network;
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

  const chartRange: Range = range === 'live' ? '15m' : range;

  return (
    <QueryResultChart
      lines={lines ?? []}
      errors={errors ?? []}
      windowMs={RANGE_WINDOW_MS[range]}
      range={chartRange}
    />
  );
}
