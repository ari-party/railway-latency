import { useToken } from '@chakra-ui/react';
import ReactECharts from 'echarts-for-react';
import React from 'react';

import { trpc } from '@/utils/trpc';

import type { Network } from '@railway-latency/types';
import type { EChartsOption } from 'echarts';

const HTTP_MEASUREMENT: Record<Network, string> = {
  private: 'http',
  public: 'httpPublicHikari',
  proxied: 'httpProxiedHikari',
};

export function Sparkline({
  dst,
  network,
  src,
}: {
  dst: string;
  network: Network;
  src: string;
}) {
  const [lines] = trpc.chart.query.useSuspenseQuery({
    src,
    dst,
    range: '15m',
    network,
  });
  const [color] = useToken('colors', ['blue.400']);

  const measurement = HTTP_MEASUREMENT[network];
  const data = (lines ?? [])
    .filter(([type]) => type === measurement)
    .map(([, time, value]): [number, number] => [
      Date.parse(time),
      Number(value),
    ])
    .sort((a, b) => a[0] - b[0]);

  const option: EChartsOption = {
    animation: false,
    grid: { top: 2, bottom: 2, left: 2, right: 2 },
    xAxis: { type: 'time', show: false },
    yAxis: { type: 'value', show: false, min: 0 },
    tooltip: { show: false },
    series: [
      {
        type: 'line',
        showSymbol: false,
        silent: true,
        data,
        lineStyle: { width: 1.5, color },
        areaStyle: { color, opacity: 0.1 },
      },
    ],
  };

  return (
    <ReactECharts
      option={option}
      style={{ height: '100%', width: '100%' }}
      notMerge
    />
  );
}
