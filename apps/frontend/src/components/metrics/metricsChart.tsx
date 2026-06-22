import { Box, Skeleton, useToken } from '@chakra-ui/react';
import ReactECharts from 'echarts-for-react';
import React from 'react';

import {
  formatDate as createDateFormatter,
  formatTooltipHeader,
} from '@/utils/format';

import type { FrontendRange } from '@/utils/query';
import type { SkeletonProps } from '@chakra-ui/react';
import type { EChartsOption, LineSeriesOption } from 'echarts';

const CHART_HEIGHT_PX = 260;
const GRID_TOP = 28;
const GRID_RIGHT = 16;
const GRID_BOTTOM = 0;
const GRID_LEFT = 0;

export interface MetricsSeries {
  name: string;
  colorToken: string;
  data: Array<[number, number | null]>;
}

const formatMonthDay = createDateFormatter({ month: 'short', day: 'numeric' });
const formatHourMinute = createDateFormatter({
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const HOUR_MINUTE_RANGES = new Set<FrontendRange>(['live', '15m', '3h', '1d']);

export function MetricsChartSkeleton({ ...props }: SkeletonProps) {
  return (
    <Skeleton
      backgroundColor="bg.subtle"
      borderRadius="lg"
      height={`${CHART_HEIGHT_PX}px`}
      {...props}
    />
  );
}

export function MetricsChart({
  formatValue,
  height = CHART_HEIGHT_PX,
  range,
  series,
  yMax,
}: {
  formatValue: (value: number) => string;
  height?: number;
  range: FrontendRange;
  series: MetricsSeries[];
  yMax?: number;
}) {
  const colorTokens = series.map((entry) => entry.colorToken);
  const palette = useToken(
    'colors',
    colorTokens.length > 0 ? colorTokens : ['violet.500'],
  );

  const [
    axisLineColor,
    gridLineColor,
    textColor,
    tooltipHeaderColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
  ] = useToken('colors', [
    'gray.300',
    'gray.100',
    'gray.500',
    'gray.500',
    'bg.emphasized',
    'gray.200',
    'gray.800',
  ]);

  const axisLabelFormatter = React.useCallback(
    (value: number | string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';

      return HOUR_MINUTE_RANGES.has(range)
        ? formatHourMinute(date)
        : formatMonthDay(date);
    },
    [range],
  );

  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<ReactECharts>(null);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastWidth = Math.round(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const width = Math.round(entries[0].contentRect.width);
      if (width === 0 || width === lastWidth) return;
      lastWidth = width;

      clearTimeout(timer);
      timer = setTimeout(
        () => chartRef.current?.getEchartsInstance().resize(),
        120,
      );
    });

    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  const option = React.useMemo<EChartsOption>(() => {
    const lineSeries: LineSeriesOption[] = series.map((entry, index) => ({
      name: entry.name,
      type: 'line',
      showSymbol: false,
      smooth: false,
      connectNulls: false,
      lineStyle: { width: 2, color: palette[index] },
      itemStyle: { color: palette[index] },
      emphasis: { focus: 'series' },
      data: entry.data,
      animation: false,
    }));

    return {
      color: palette,
      animation: false,
      grid: {
        top: GRID_TOP,
        right: GRID_RIGHT,
        bottom: GRID_BOTTOM,
        left: GRID_LEFT,
        containLabel: true,
      },
      legend: {
        show: series.length > 1,
        data: series.map((entry) => entry.name),
        textStyle: { color: textColor },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'line' },
        backgroundColor: tooltipBgColor,
        borderColor: tooltipBorderColor,
        borderWidth: 1,
        textStyle: { color: tooltipTextColor },
        formatter: (rawParams: unknown) => {
          if (!Array.isArray(rawParams) || rawParams.length === 0) return '';

          const params = rawParams as Array<{
            marker: string;
            seriesName: string;
            value: unknown;
          }>;

          const first = params[0];
          const firstValue = Array.isArray(first?.value)
            ? first.value[0]
            : first?.value;
          if (typeof firstValue !== 'number' || !Number.isFinite(firstValue))
            return '';

          const header = `<div style="color: ${tooltipHeaderColor};">${formatTooltipHeader(
            new Date(firstValue),
          )}</div>`;

          const rows = params
            .map((item) => {
              const value = Array.isArray(item.value)
                ? item.value[1]
                : item.value;
              if (typeof value !== 'number' || !Number.isFinite(value))
                return '';

              return `<div>${item.marker} ${item.seriesName}: ${formatValue(value)}</div>`;
            })
            .filter(Boolean)
            .join('');

          return `<div>${header}${rows}</div>`;
        },
      },
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: axisLineColor } },
        axisLabel: { color: textColor, formatter: axisLabelFormatter },
        splitLine: { show: true, lineStyle: { color: gridLineColor } },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yMax,
        axisLabel: { color: textColor, formatter: formatValue },
        splitLine: { lineStyle: { color: gridLineColor } },
      },
      series: lineSeries,
    };
  }, [
    axisLabelFormatter,
    axisLineColor,
    formatValue,
    gridLineColor,
    palette,
    series,
    textColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipHeaderColor,
    tooltipTextColor,
    yMax,
  ]);

  return (
    <Box ref={containerRef} width="100%" minWidth="0" height={`${height}px`}>
      <ReactECharts
        ref={chartRef}
        option={option}
        style={{ height: '100%', width: '100%' }}
        notMerge
        lazyUpdate
      />
    </Box>
  );
}
