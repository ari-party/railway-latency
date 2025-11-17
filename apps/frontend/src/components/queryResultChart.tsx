import { Box, Skeleton, useToken } from '@chakra-ui/react';
import { RANGES } from '@railway-latency/utils';
import ReactECharts from 'echarts-for-react';
import React from 'react';

import {
  formatDate as createDateFormatter,
  formatNumber as createNumberFormatter,
} from '@/utils/format';
import measurementToColorToken from '@/utils/measurementToColorToken';
import { trpc } from '@/utils/trpc';

import type { SkeletonProps } from '@chakra-ui/react';
import type { Range } from '@railway-latency/utils';
import type { EChartsOption, EChartsType } from 'echarts';

const MIN_ZOOM_RATIO = 0.01;
const MIN_ZOOM_SPAN_MS = 1;
const RANGE_EPSILON = 1;
const GRID_TOP = 24;
const GRID_RIGHT = 24;
const GRID_BOTTOM = 0;
const GRID_LEFT = 0;
const CHART_HEIGHT_PX = 320;
const MIN_SELECTION_PIXEL_WIDTH = 3;

const HOVER_DISABLED_TYPES = new Set<string>(['dns']);

const formatMonthDay = createDateFormatter({ month: 'short', day: 'numeric' });
const formatHourMinute = createDateFormatter({
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});
const formatValueNumber = createNumberFormatter({ maximumFractionDigits: 2 });

const tooltipHeaderFormatter = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const tooltipTimeZoneShortFormatter = new Intl.DateTimeFormat(undefined, {
  timeZoneName: 'short',
});

const tooltipTimeZoneLongFormatter = new Intl.DateTimeFormat(undefined, {
  timeZoneName: 'long',
});

function extractTimeZoneAbbreviation(date: Date): string | undefined {
  const shortParts = tooltipTimeZoneShortFormatter
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;

  if (shortParts && /^[A-Za-z]{2,5}$/.test(shortParts))
    return shortParts.toUpperCase();

  const longName = tooltipTimeZoneLongFormatter
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value;
  if (!longName) return shortParts;

  const tokens = longName.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return shortParts;

  const filtered = tokens.filter(
    (token) =>
      !['standard', 'daylight', 'summer'].includes(token.toLowerCase()),
  );
  const abbreviation = filtered.map((token) => token[0]).join('');

  return abbreviation.length > 0
    ? abbreviation.toUpperCase()
    : shortParts?.toUpperCase();
}

function formatTooltipHeader(date: Date): string {
  const parts = tooltipHeaderFormatter.formatToParts(date);

  let day: string | undefined;
  let month: string | undefined;
  let hour: string | undefined;
  let minute: string | undefined;
  for (const part of parts)
    switch (part.type) {
      case 'day':
        day = part.value;
        break;
      case 'month':
        month = part.value;
        break;
      case 'hour':
        hour = part.value;
        break;
      case 'minute':
        minute = part.value;
        break;
      default:
        break;
    }

  const zone = extractTimeZoneAbbreviation(date);

  if (!day || !month || !hour || !minute || !zone)
    return tooltipHeaderFormatter.format(date);

  return `${day} ${month} · ${hour}:${minute} ${zone}`;
}

export function QueryResultChartSkeleton({ ...props }: SkeletonProps) {
  return (
    <Skeleton
      backgroundColor="bg.subtle"
      borderRadius="lg"
      height="320px"
      {...props}
    />
  );
}

export function QueryResultChart({
  dst,
  range,
  src,
}: {
  src: string;
  dst: string;
  range: Range;
}) {
  const [dataLines] = trpc.chart.query.useSuspenseQuery({ src, dst, range });
  const lines = React.useMemo(() => dataLines ?? [], [dataLines]);

  const { maxValue, seriesEntries, xExtent } = React.useMemo(() => {
    const typeMap = new Map<
      string,
      {
        type: string;
        name: string;
        colorToken: string;
        data: Array<[number, number]>;
      }
    >();
    let max = -Infinity;
    let minTimestamp = Infinity;
    let maxTimestamp = -Infinity;

    for (const [type, time, valueStr] of lines) {
      const value = Number(valueStr);
      if (!Number.isFinite(value)) continue;

      const timestamp = Date.parse(time);
      if (!Number.isFinite(timestamp)) continue;

      let entry = typeMap.get(type);
      if (!entry) {
        entry = {
          type,
          name: type.toUpperCase(),
          colorToken: measurementToColorToken(type),
          data: [],
        };
        typeMap.set(type, entry);
      }

      entry.data.push([timestamp, value]);
      max = Math.max(max, value);
      minTimestamp = Math.min(minTimestamp, timestamp);
      maxTimestamp = Math.max(maxTimestamp, timestamp);
    }

    const SERIES_ORDER = ['http', 'dns'] as const;
    const orderedEntries = Array.from(typeMap.entries())
      .sort(([typeA], [typeB]) => {
        const indexA = SERIES_ORDER.indexOf(
          typeA as (typeof SERIES_ORDER)[number],
        );
        const indexB = SERIES_ORDER.indexOf(
          typeB as (typeof SERIES_ORDER)[number],
        );

        const orderA = indexA === -1 ? SERIES_ORDER.length : indexA;
        const orderB = indexB === -1 ? SERIES_ORDER.length : indexB;

        if (orderA !== orderB) return orderA - orderB;

        return typeA.localeCompare(typeB);
      })
      .map(([, entry]) => entry);

    return {
      maxValue: max,
      seriesEntries: orderedEntries,
      xExtent:
        Number.isFinite(minTimestamp) && Number.isFinite(maxTimestamp)
          ? ([minTimestamp, maxTimestamp] as const)
          : undefined,
    };
  }, [lines]);

  const colorTokens = React.useMemo(
    () => seriesEntries.map((entry) => entry.colorToken),
    [seriesEntries],
  );

  const hoverDisabledSeries = React.useMemo(
    () =>
      new Set(
        seriesEntries
          .filter((entry) => HOVER_DISABLED_TYPES.has(entry.type))
          .map((entry) => entry.name),
      ),
    [seriesEntries],
  );

  const colorPalette = useToken(
    'colors',
    colorTokens.length > 0 ? colorTokens : ['blue.500'],
  );

  const seriesColors = React.useMemo(
    () => (colorTokens.length > 0 ? colorPalette : []),
    [colorPalette, colorTokens],
  );
  const fallbackColor = colorPalette[0];

  const yDomainMax = React.useMemo(() => {
    if (!Number.isFinite(maxValue) || maxValue <= 0) return 50;

    const groupedMax = Math.ceil(maxValue / 50) * 50;
    return Math.max(groupedMax, 50);
  }, [maxValue]);

  const minZoomSpan = React.useMemo(() => {
    if (!xExtent) return MIN_ZOOM_SPAN_MS;

    const total = xExtent[1] - xExtent[0];
    if (!(total > 0)) return MIN_ZOOM_SPAN_MS;

    return Math.max(total * MIN_ZOOM_RATIO, MIN_ZOOM_SPAN_MS);
  }, [xExtent]);

  const zoomWindowRef = React.useRef<readonly [number, number] | undefined>(
    undefined,
  );
  const chartInstanceRef = React.useRef<EChartsType | null>(null);
  const [isChartReady, setChartReady] = React.useState(false);
  const [selectionRect, setSelectionRect] = React.useState<{
    left: number;
    width: number;
    top: number;
    height: number;
  } | null>(null);
  const dragStateRef = React.useRef<{
    active: boolean;
    startX: number;
    lastX: number;
    top: number;
    height: number;
  }>({
    active: false,
    startX: 0,
    lastX: 0,
    top: GRID_TOP,
    height: 0,
  });

  const setZoomWindowRange = React.useCallback((start: number, end: number) => {
    const previous = zoomWindowRef.current;
    if (
      previous &&
      Math.abs(previous[0] - start) < RANGE_EPSILON &&
      Math.abs(previous[1] - end) < RANGE_EPSILON
    )
      return;

    zoomWindowRef.current = [start, end] as const;
  }, []);

  const [
    axisLineColor,
    gridLineColor,
    textColor,
    tooltipHeaderColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
  ] = useToken('colors', [
    'gray.600',
    'gray.100',
    'gray.500',
    'gray.600',
    'bg.subtle',
    'gray.200',
    'fg.solid',
  ]);

  const useHourMinuteLabels = React.useMemo(() => {
    const index = RANGES.indexOf(range);
    return index > -1 && index < 3;
  }, [range]);

  const axisLabelFormatter = React.useCallback(
    (value: number | string) => {
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return '';

      if (useHourMinuteLabels) return formatHourMinute(date);

      return formatMonthDay(date);
    },
    [useHourMinuteLabels],
  );

  const handleChartReady = React.useCallback((instance: EChartsType) => {
    chartInstanceRef.current = instance;
    setChartReady(true);
  }, []);

  const dispatchZoomRange = React.useCallback((start: number, end: number) => {
    const instance = chartInstanceRef.current;
    if (!instance) return;

    instance.dispatchAction({
      type: 'dataZoom',
      dataZoomIndex: 0,
      startValue: start,
      endValue: end,
    });
  }, []);

  React.useEffect(() => {
    if (!xExtent) {
      zoomWindowRef.current = undefined;
      return;
    }

    setZoomWindowRange(xExtent[0], xExtent[1]);

    if (isChartReady) dispatchZoomRange(xExtent[0], xExtent[1]);
  }, [dispatchZoomRange, isChartReady, range, setZoomWindowRange, xExtent]);

  React.useEffect(() => {
    if (!isChartReady) return;

    const instance = chartInstanceRef.current;
    if (!instance) return;

    type DataZoomPayload = {
      batch?: Array<{
        startValue?: number;
        endValue?: number;
        start?: number;
        end?: number;
      }>;
      startValue?: number;
      endValue?: number;
      start?: number;
      end?: number;
    };

    const handleDataZoom = (rawEvent: unknown) => {
      const event = rawEvent as DataZoomPayload | undefined;
      const payload = Array.isArray(event?.batch) ? event?.batch?.[0] : event;
      if (!payload) return;

      let { endValue, startValue } = payload;
      const extent = xExtent ?? zoomWindowRef.current;

      if (
        extent &&
        (startValue == null || endValue == null) &&
        typeof payload.start === 'number' &&
        typeof payload.end === 'number'
      ) {
        const total = extent[1] - extent[0];
        startValue = extent[0] + (payload.start / 100) * total;
        endValue = extent[0] + (payload.end / 100) * total;
      }

      if (typeof startValue === 'number' && typeof endValue === 'number')
        setZoomWindowRange(startValue, endValue);
    };

    instance.on('dataZoom', handleDataZoom);

    return () => {
      instance.off('dataZoom', handleDataZoom);
    };
  }, [isChartReady, setZoomWindowRange, xExtent]);

  React.useEffect(() => {
    if (!isChartReady) return;

    const instance = chartInstanceRef.current;
    if (!instance) return;
    const zr = typeof instance.getZr === 'function' ? instance.getZr() : null;
    if (!zr) return;
    const dom = instance.getDom();
    if (!dom) return;

    const finalizeSelection = (rawOffsetX?: number) => {
      const state = dragStateRef.current;
      if (!state.active) return;

      const endX =
        typeof rawOffsetX === 'number'
          ? rawOffsetX
          : Number.isFinite(state.lastX)
            ? state.lastX
            : state.startX;
      const startX = state.startX;

      dragStateRef.current = {
        active: false,
        startX: 0,
        lastX: 0,
        top: GRID_TOP,
        height: 0,
      };

      setSelectionRect(null);
      zr.setCursorStyle('default');

      if (!Number.isFinite(startX) || !Number.isFinite(endX)) return;
      if (Math.abs(endX - startX) < MIN_SELECTION_PIXEL_WIDTH) return;

      const minPixel = Math.min(startX, endX);
      const maxPixel = Math.max(startX, endX);
      const chartWidth = instance.getWidth();
      if (!(chartWidth > 0)) return;
      const clampPixel = (pixel: number) =>
        Math.min(Math.max(pixel, 0), chartWidth);
      const clampedMinPixel = clampPixel(minPixel);
      const clampedMaxPixel = clampPixel(maxPixel);

      const convertPixelToValue = (pixel: number): number | undefined => {
        const result = instance.convertFromPixel({ xAxisIndex: 0 }, pixel);

        if (Array.isArray(result)) {
          const numeric = Number(result[0]);
          return Number.isFinite(numeric) ? numeric : undefined;
        }
        if (typeof result === 'number') {
          const numeric = Number(result);
          return Number.isFinite(numeric) ? numeric : undefined;
        }

        return undefined;
      };

      let startValue = convertPixelToValue(clampedMinPixel);
      let endValue = convertPixelToValue(clampedMaxPixel);
      if (
        typeof startValue !== 'number' ||
        !Number.isFinite(startValue) ||
        typeof endValue !== 'number' ||
        !Number.isFinite(endValue)
      )
        return;

      if (startValue > endValue)
        [startValue, endValue] = [endValue, startValue];

      const extent = xExtent ?? zoomWindowRef.current;
      if (extent) {
        const [extentStart, extentEnd] = extent;

        if (Number.isFinite(extentStart))
          startValue = Math.max(startValue, extentStart);
        if (Number.isFinite(extentEnd))
          endValue = Math.min(endValue, extentEnd);
      }

      if (!(endValue > startValue)) return;

      if (endValue - startValue < minZoomSpan) {
        const span = minZoomSpan;
        const center = (startValue + endValue) / 2;
        startValue = center - span / 2;
        endValue = center + span / 2;

        const extentToClamp = extent ?? zoomWindowRef.current;
        if (extentToClamp) {
          const [extentStart, extentEnd] = extentToClamp;

          if (Number.isFinite(extentStart) && startValue < extentStart) {
            startValue = extentStart;
            endValue = extentStart + span;
          }
          if (Number.isFinite(extentEnd) && endValue > extentEnd) {
            endValue = extentEnd;
            startValue = extentEnd - span;
          }
        }

        if (!(endValue > startValue)) return;
      }

      setZoomWindowRange(startValue, endValue);
      dispatchZoomRange(startValue, endValue);
    };

    const handleMouseDown = (params: {
      event: MouseEvent | TouchEvent | PointerEvent;
      offsetX: number;
      offsetY: number;
    }) => {
      const mouseEvent = params.event as MouseEvent | PointerEvent;
      if (mouseEvent && 'button' in mouseEvent && mouseEvent.button !== 0)
        return;
      if (mouseEvent?.shiftKey) return;

      const { offsetX, offsetY } = params;
      const point: [number, number] = [offsetX, offsetY];
      const isWithinGrid = instance.containPixel({ gridIndex: 0 }, point);
      const isWithinXAxis = instance.containPixel({ xAxisIndex: 0 }, point);
      const isWithinYAxis = instance.containPixel({ yAxisIndex: 0 }, point);
      if (!isWithinGrid && !isWithinXAxis && !isWithinYAxis) return;

      mouseEvent?.preventDefault?.();
      mouseEvent?.stopPropagation?.();

      const chartHeight = instance.getHeight();
      const plotHeight = Math.max(chartHeight - GRID_TOP - GRID_BOTTOM, 0);
      const selectionHeight =
        plotHeight > 0 ? plotHeight : Math.max(chartHeight, 0);
      const selectionTop = plotHeight > 0 ? GRID_TOP : 0;

      dragStateRef.current = {
        active: true,
        startX: offsetX,
        lastX: offsetX,
        top: selectionTop,
        height: selectionHeight,
      };

      zr.setCursorStyle('crosshair');

      setSelectionRect({
        left: offsetX,
        width: 0,
        top: selectionTop,
        height: selectionHeight,
      });
    };

    const handleMouseMove = (params: { offsetX: number }) => {
      const state = dragStateRef.current;
      if (!state.active) return;

      const { offsetX } = params;
      state.lastX = offsetX;

      const left = Math.min(state.startX, offsetX);
      const width = Math.abs(state.startX - offsetX);

      setSelectionRect({
        left,
        width,
        top: state.top,
        height: state.height,
      });
    };

    const handleMouseUp = (params: { offsetX: number }) => {
      finalizeSelection(params.offsetX);
    };

    const handleGlobalOut = () => {
      finalizeSelection();
    };

    const handlePointerUp = (event: PointerEvent) => {
      if (!dragStateRef.current.active) return;
      const rect = dom.getBoundingClientRect();
      const offsetX = event.clientX - rect.left;
      finalizeSelection(offsetX);
    };

    zr.on('mousedown', handleMouseDown);
    zr.on('mousemove', handleMouseMove);
    zr.on('mouseup', handleMouseUp);
    zr.on('globalout', handleGlobalOut);

    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    window.addEventListener('pointerleave', handlePointerUp);

    return () => {
      zr.off('mousedown', handleMouseDown);
      zr.off('mousemove', handleMouseMove);
      zr.off('mouseup', handleMouseUp);
      zr.off('globalout', handleGlobalOut);

      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('pointerleave', handlePointerUp);

      if (dragStateRef.current.active) {
        dragStateRef.current.active = false;
        setSelectionRect(null);
        zr.setCursorStyle('default');
      }
    };
  }, [
    dispatchZoomRange,
    isChartReady,
    minZoomSpan,
    setZoomWindowRange,
    xExtent,
  ]);

  React.useEffect(() => {
    if (!isChartReady) return;
    if (!chartInstanceRef.current) return;
    if (!xExtent) return;

    const [min, max] = xExtent;
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return;

    const current = zoomWindowRef.current;
    if (!current) {
      setZoomWindowRange(min, max);

      dispatchZoomRange(min, max);
      return;
    }

    let [start, end] = current;
    let updated = false;

    if (start < min) {
      start = min;
      updated = true;
    }

    if (end > max) {
      end = max;
      updated = true;
    }

    if (start >= end) {
      start = min;
      end = max;
      updated = true;
    }

    if (!updated) return;

    setZoomWindowRange(start, end);

    dispatchZoomRange(start, end);
  }, [dispatchZoomRange, isChartReady, setZoomWindowRange, xExtent]);

  const option = React.useMemo<EChartsOption>(() => {
    const hasData = seriesEntries.length > 0;

    const series = seriesEntries.map((entry, index) => {
      const hoverDisabled = hoverDisabledSeries.has(entry.name);
      return {
        name: entry.name,
        type: 'line' as const,
        showSymbol: false,
        smooth: false,
        lineStyle: {
          width: 2,
          color: seriesColors[index] ?? fallbackColor,
        },
        itemStyle: {
          color: seriesColors[index] ?? fallbackColor,
        },
        emphasis: {
          focus: hoverDisabled ? undefined : ('series' as const),
          disabled: hoverDisabled,
        },
        silent: true,
        data: entry.data,
        animation: false,
      };
    });

    return {
      color: seriesColors.length > 0 ? seriesColors : [fallbackColor],
      animation: false,
      grid: {
        top: GRID_TOP,
        right: GRID_RIGHT,
        bottom: GRID_BOTTOM,
        left: GRID_LEFT,
        containLabel: true,
      },
      legend: {
        show: hasData,
        data: seriesEntries.map((entry) => entry.name),
        textStyle: {
          color: textColor,
        },
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'line',
        },
        backgroundColor: tooltipBgColor,
        borderColor: tooltipBorderColor,
        borderWidth: 1,
        textStyle: {
          color: tooltipTextColor,
        },
        formatter: (rawParams: unknown) => {
          if (!Array.isArray(rawParams) || rawParams.length === 0) return '';

          const params = rawParams as Array<{
            marker: string;
            seriesName: string;
            value: unknown;
          }>;

          if (params.length === 0) return '';

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
              const numericValue =
                typeof value === 'number' ? value : Number(value);

              if (!Number.isFinite(numericValue)) return '';
              const formattedNumber = formatValueNumber(numericValue);
              return `<div>${item.marker} ${item.seriesName}: ${formattedNumber}</div>`;
            })
            .filter(Boolean)
            .join('');

          return `<div>${header}${rows}</div>`;
        },
      },
      xAxis: {
        type: 'time',
        min: xExtent?.[0],
        max: xExtent?.[1],
        axisLine: {
          lineStyle: {
            color: axisLineColor,
          },
        },
        axisLabel: {
          color: textColor,
          formatter: axisLabelFormatter,
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: gridLineColor,
          },
        },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: yDomainMax,
        axisLabel: {
          color: textColor,
        },
        splitLine: {
          lineStyle: {
            color: gridLineColor,
          },
        },
      },
      dataZoom: [
        {
          type: 'inside',
          zoomOnMouseWheel: true,
          moveOnMouseWheel: false,
          moveOnMouseMove: 'shift',
          rangeMode: ['value', 'value'],
          minValueSpan: minZoomSpan,
        },
      ],
      series,
    };
  }, [
    axisLabelFormatter,
    axisLineColor,
    fallbackColor,
    gridLineColor,
    seriesColors,
    seriesEntries,
    hoverDisabledSeries,
    textColor,
    tooltipHeaderColor,
    tooltipBgColor,
    tooltipBorderColor,
    tooltipTextColor,
    xExtent,
    minZoomSpan,
    yDomainMax,
  ]);

  return (
    <Box width="100%" maxWidth="4xl" userSelect="none">
      <Box position="relative" height={`${CHART_HEIGHT_PX}px`}>
        <ReactECharts
          onChartReady={handleChartReady}
          option={option}
          style={{ height: '100%', width: '100%' }}
          notMerge
          lazyUpdate
        />
        {selectionRect && selectionRect.width > 0 && (
          <Box
            position="absolute"
            pointerEvents="none"
            top={`${selectionRect.top}px`}
            left={`${selectionRect.left}px`}
            width={`${selectionRect.width}px`}
            height={`${Math.max(selectionRect.height, 1)}px`}
            backgroundColor="rgba(0, 0, 0, 0.08)"
            border={`1px solid ${axisLineColor}`}
          />
        )}
      </Box>
    </Box>
  );
}
