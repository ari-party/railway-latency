import { Box, Button, Center, Spinner, Text } from '@chakra-ui/react';
import { getRegionCoord } from '@railway-latency/utils';
import * as echarts from 'echarts';
import ReactECharts from 'echarts-for-react';
import React from 'react';

import { trpc } from '@/utils/trpc';

import type { GeoHop, MtrResultsDictionary } from '@railway-latency/types';
import type { EChartsOption, EChartsType } from 'echarts';

const REFRESH_MS = 5 * 60 * 1000;

const ROUTE_PALETTE = [
  '#60a5fa',
  '#f472b6',
  '#34d399',
  '#fbbf24',
  '#a78bfa',
  '#fb7185',
  '#22d3ee',
  '#4ade80',
  '#fb923c',
  '#c084fc',
  '#2dd4bf',
  '#e879f9',
];

const TO_RAD = Math.PI / 180;
const TO_DEG = 180 / Math.PI;

// Great-circle interpolation so a path bends correctly on the flat map.
function geodesicSegment(
  a: [number, number],
  b: [number, number],
): Array<[number, number]> {
  const lon1 = a[0] * TO_RAD;
  const lat1 = a[1] * TO_RAD;
  const lon2 = b[0] * TO_RAD;
  const lat2 = b[1] * TO_RAD;

  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2,
      ),
    );
  if (!Number.isFinite(d) || d === 0) return [a, b];

  const steps = Math.max(2, Math.min(48, Math.round((d * TO_DEG) / 2)));
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x =
      A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y =
      A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    points.push([
      Math.atan2(y, x) * TO_DEG,
      Math.atan2(z, Math.sqrt(x * x + y * y)) * TO_DEG,
    ]);
  }
  return points;
}

function densifyPath(coords: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < coords.length - 1; i += 1) {
    const segment = geodesicSegment(coords[i], coords[i + 1]);
    if (i > 0) segment.shift();
    out.push(...segment);
  }
  return out;
}

// Split at the antimeridian so a path wraps across the map edges, not the world.
function splitAtAntimeridian(
  points: Array<[number, number]>,
): Array<Array<[number, number]>> {
  if (points.length === 0) return [];

  const subs: Array<Array<[number, number]>> = [];
  let cur: Array<[number, number]> = [points[0]];

  for (let i = 1; i < points.length; i += 1) {
    const a = cur[cur.length - 1];
    const b = points[i];
    if (Math.abs(b[0] - a[0]) > 180) {
      const sign = a[0] > 0 ? 1 : -1;
      const bAdj = b[0] + sign * 360;
      const t = (sign * 180 - a[0]) / (bAdj - a[0]);
      const latCross = a[1] + (b[1] - a[1]) * t;
      cur.push([sign * 180, latCross]);
      subs.push(cur);
      cur = [[-sign * 180, latCross], b];
    } else {
      cur.push(b);
    }
  }
  subs.push(cur);
  return subs;
}

// Chaikin corner-cutting to round the sharp turns where a path doubles back.
function smoothPath(
  points: Array<[number, number]>,
  iterations = 2,
): Array<[number, number]> {
  let pts = points;
  for (let it = 0; it < iterations; it += 1) {
    if (pts.length < 3) break;
    const out: Array<[number, number]> = [pts[0]];
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p = pts[i];
      const q = pts[i + 1];
      out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      out.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    out.push(pts[pts.length - 1]);
    pts = out;
  }
  return pts;
}

function routeLatency(hops: GeoHop[]): number | null {
  for (let i = hops.length - 1; i >= 0; i -= 1)
    if (hops[i].avgMs != null) return hops[i].avgMs;
  return null;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&]/g, (c) =>
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;',
  );
}

function hopInfo(hop: GeoHop): string {
  const lines: string[] = [`<b>Hop ${hop.hop}</b>`];
  lines.push(hop.ip ?? '* (no response)');
  if (hop.hostname) lines.push(escapeHtml(hop.hostname));
  const place = [hop.city, hop.country].filter(Boolean).join(', ');
  if (place) lines.push(escapeHtml(place));
  const net = [hop.isp, hop.asn ? `AS${hop.asn}` : null]
    .filter(Boolean)
    .join(' · ');
  if (net) lines.push(escapeHtml(net));
  if (hop.avgMs != null)
    lines.push(
      `avg ${hop.avgMs.toFixed(1)} ms${hop.lossPct ? ` · ${hop.lossPct}% loss` : ''}`,
    );
  return lines.join('<br/>');
}

let worldRegistered = false;

type Selected = { src: string; dst: string } | null;

interface DataItem {
  [key: string]: unknown;
}

export function MtrMap() {
  const { data } = trpc.mtr.data.useQuery(undefined, {
    refetchInterval: REFRESH_MS,
  });
  const routes = React.useMemo<MtrResultsDictionary>(() => data ?? {}, [data]);

  const [mapReady, setMapReady] = React.useState(worldRegistered);
  const [selected, setSelected] = React.useState<Selected>(null);

  React.useEffect(() => {
    if (worldRegistered) return;
    let cancelled = false;

    fetch('/world.json')
      .then((res) => res.json())
      .then((world) => {
        if (cancelled) return;
        echarts.registerMap('world', world);
        worldRegistered = true;
        setMapReady(true);
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const hasRoutes = Object.values(routes).some(
    (dsts) => Object.keys(dsts).length > 0,
  );

  const option = React.useMemo<EChartsOption>(() => {
    const routeKeys: string[] = [];
    for (const [src, dsts] of Object.entries(routes))
      for (const dst of Object.keys(dsts)) routeKeys.push(`${src}:${dst}`);
    routeKeys.sort();

    const routeColors = new Map<string, string>();
    routeKeys.forEach((key, i) =>
      routeColors.set(key, ROUTE_PALETTE[i % ROUTE_PALETTE.length]),
    );

    const lineData: DataItem[] = [];
    const hopData: DataItem[] = [];
    const regionData: DataItem[] = [];
    const seenRegions = new Set<string>();

    const addRegionNode = (region: string) => {
      if (seenRegions.has(region)) return;
      const coord = getRegionCoord(region);
      if (!coord) return;
      seenRegions.add(region);
      const isActive =
        !selected || selected.src === region || selected.dst === region;
      regionData.push({
        value: [coord.lng, coord.lat],
        info: `<b>${escapeHtml(region)}</b>`,
        itemStyle: { opacity: isActive ? 1 : 0.15 },
      });
    };

    for (const [src, dsts] of Object.entries(routes))
      for (const [dst, route] of Object.entries(dsts)) {
        const routeKey = `${src}:${dst}`;
        const color = routeColors.get(routeKey) ?? ROUTE_PALETTE[0];
        const isActive =
          !selected || (selected.src === src && selected.dst === dst);

        const srcCoord = getRegionCoord(src);
        const dstCoord = getRegionCoord(dst);

        const coords: Array<[number, number]> = [];
        if (srcCoord) coords.push([srcCoord.lng, srcCoord.lat]);
        for (const hop of route.hops) {
          if (hop.lat == null || hop.lng == null) continue;
          coords.push([hop.lng, hop.lat]);
          hopData.push({
            value: [hop.lng, hop.lat],
            routeKey,
            info: hopInfo(hop),
            itemStyle: { color, opacity: isActive ? 0.95 : 0.12 },
          });
        }
        if (dstCoord) coords.push([dstCoord.lng, dstCoord.lat]);

        addRegionNode(src);
        addRegionNode(dst);

        if (coords.length < 2) continue;

        const ms = routeLatency(route.hops);
        const info = `<b>${escapeHtml(src)} → ${escapeHtml(dst)}</b><br/>end-to-end ${
          ms != null ? `${ms.toFixed(1)} ms` : 'n/a'
        }`;

        const subPaths = splitAtAntimeridian(densifyPath(coords)).map((sp) =>
          smoothPath(sp),
        );
        let longest = 0;
        subPaths.forEach((sp, i) => {
          if (sp.length > subPaths[longest].length) longest = i;
        });

        subPaths.forEach((sp, i) => {
          lineData.push({
            coords: sp,
            routeKey,
            info,
            lineStyle: {
              color,
              width: isActive ? 3 : 1.4,
              opacity: isActive ? 0.95 : 0.12,
            },
            label: {
              show: isActive && ms != null && i === longest,
              formatter: ms != null ? `${Math.round(ms)} ms` : '',
              color: '#0b1220',
              backgroundColor: color,
              padding: [2, 5],
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 'bold',
            },
          });
        });
      }

    return {
      backgroundColor: 'transparent',
      tooltip: {
        trigger: 'item',
        backgroundColor: '#0b1220',
        borderColor: '#1e293b',
        textStyle: { color: '#e5e7eb', fontSize: 12 },
        formatter: (p: unknown) => {
          const info = (p as { data?: { info?: string } })?.data?.info;
          return info ?? '';
        },
      },
      geo: {
        map: 'world',
        roam: true,
        silent: true,
        itemStyle: { areaColor: '#1b2230', borderColor: '#2b3648' },
        emphasis: { disabled: true },
        scaleLimit: { min: 1, max: 8 },
      },
      series: [
        {
          type: 'lines',
          coordinateSystem: 'geo',
          polyline: true,
          zlevel: 1,
          label: { position: 'middle' },
          data: lineData,
        },
        {
          name: 'hops',
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 2,
          symbolSize: 10,
          emphasis: { scale: 1.8 },
          data: hopData,
        },
        {
          name: 'regions',
          type: 'scatter',
          coordinateSystem: 'geo',
          zlevel: 3,
          symbolSize: 18,
          itemStyle: { color: '#3b82f6' },
          emphasis: { scale: 1.5 },
          data: regionData,
        },
      ],
    } as EChartsOption;
  }, [routes, selected]);

  const onEvents = React.useMemo(
    () => ({
      click: (params: { data?: { routeKey?: string } }) => {
        const key = params?.data?.routeKey;
        if (!key) return;
        const [src, dst] = key.split(':');
        setSelected({ src, dst });
      },
    }),
    [],
  );

  const handleReady = React.useCallback((instance: EChartsType) => {
    const zr = instance.getZr();
    zr.on('click', (event: { target?: unknown }) => {
      if (!event.target) setSelected(null);
    });
  }, []);

  if (!mapReady)
    return (
      <Center height="100svh">
        <Spinner />
      </Center>
    );

  return (
    <Box position="relative" height="100svh" width="100%">
      {!hasRoutes && (
        <Center position="absolute" inset={0} zIndex={1} pointerEvents="none">
          <Text color="gray.400">
            Collecting MTR data… (updates every 5 min)
          </Text>
        </Center>
      )}

      {selected && (
        <Button
          position="absolute"
          top={4}
          left={4}
          zIndex={2}
          size="sm"
          variant="outline"
          color="fg"
          borderColor="gray.300"
          backgroundColor="bg.subtle"
          onClick={() => setSelected(null)}
        >
          {selected.src} → {selected.dst} · Show all routes ✕
        </Button>
      )}

      <ReactECharts
        option={option}
        onChartReady={handleReady}
        onEvents={onEvents}
        notMerge
        style={{ height: '100%', width: '100%' }}
      />
    </Box>
  );
}
