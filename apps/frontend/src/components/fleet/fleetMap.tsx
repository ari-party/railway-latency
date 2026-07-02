import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { cityNameFromProbeId } from '@railway-latency/utils';
import React from 'react';
import MapGL, {
  AttributionControl,
  Layer,
  NavigationControl,
  Popup,
  Source,
} from 'react-map-gl/maplibre';

import 'maplibre-gl/dist/maplibre-gl.css';

import {
  matchPopByHikari,
  probeArcsGeoJSON,
  probeCfPopArcsGeoJSON,
  probePopArcsGeoJSON,
} from '@/components/fleet/geojson';
import { POP_COLOR, PopMarker } from '@/components/fleet/popMarker';
import { ProbeMarker } from '@/components/fleet/probeMarker';
import { STATUS_COLOR, STATUS_LABEL } from '@/components/fleet/probeStatus';
import { REGION_COLOR, RegionMarker } from '@/components/fleet/regionMarker';
import { usePops } from '@/components/fleet/usePops';
import { trpc } from '@/utils/trpc';

import type { ArcDestination, ArcSegment } from '@/components/fleet/geojson';
import type { RailwayPop } from '@/components/fleet/usePops';
import type { RailwayMarker } from '@/components/map/markers';
import type { LngLat } from '@/utils/greatCircle';
import type { Network, ProbeMetadata } from '@railway-latency/types';
import type { FeatureCollection, Point } from 'geojson';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { MapLayerMouseEvent, MapRef } from 'react-map-gl/maplibre';

const POP_DOWN_COLOR = 'hsl(2, 82%, 63%)';
const CF_POP_COLOR = '#f6821f';

const MAP_STYLE_URL =
  'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

const ARC_LINE_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'segment'],
  'probe-cfpop',
  CF_POP_COLOR,
  'cfpop-region',
  CF_POP_COLOR,
  'probe-pop',
  POP_COLOR,
  'cfpop-pop',
  POP_COLOR,
  REGION_COLOR,
];

interface CfPopProperties {
  iata: string;
  city: string;
  inUse: boolean;
}

interface CfTip {
  lng: number;
  lat: number;
  iata: string;
  city: string;
}

function formatLatency(latencyMs: number | null): string {
  return latencyMs == null ? '—' : `${Math.round(latencyMs)} ms`;
}

interface ArcTip {
  lng: number;
  lat: number;
  segment?: ArcSegment;
  pop?: string;
  dst?: string;
  region?: string;
  latencyMs: number | null;
  dests: ArcDestination[];
}

export function FleetMap({
  network,
  onSelectProbe,
  onSelectRegion,
  probes,
  regions,
  selectedProbeId,
  selectedRegion,
}: {
  network: Network;
  onSelectProbe: (probeId: string) => void;
  onSelectRegion: (region: string) => void;
  probes: ProbeMetadata[];
  regions: RailwayMarker[];
  selectedProbeId: string | null;
  selectedRegion: RailwayMarker | null;
}) {
  const mapRef = React.useRef<MapRef>(null);
  const [hovered, setHovered] = React.useState<ProbeMetadata | null>(null);
  const [hoveredPop, setHoveredPop] = React.useState<RailwayPop | null>(null);
  const [hoveredRegion, setHoveredRegion] =
    React.useState<RailwayMarker | null>(null);
  const [arcTip, setArcTip] = React.useState<ArcTip | null>(null);
  const [cfTip, setCfTip] = React.useState<CfTip | null>(null);
  const arcKeyRef = React.useRef<string | null>(null);
  const pops = usePops();

  const selectedProbe =
    probes.find((probe) => probe.probeId === selectedProbeId) ?? null;

  // Region probes write check_events with src = region slug, so a region flows
  // through the same probe-pops pipeline with its coords as the arc origin.
  const source = React.useMemo(() => {
    if (selectedProbe)
      return {
        id: selectedProbe.probeId,
        lat: selectedProbe.lat,
        lon: selectedProbe.lon,
      };
    if (selectedRegion)
      return {
        id: selectedRegion.region,
        lat: selectedRegion.lat,
        lon: selectedRegion.lon,
      };
    return null;
  }, [selectedProbe, selectedRegion]);

  const popNetwork = network === 'private' ? 'public' : network;
  const recentPops = trpc.probes.recentPops.useQuery(
    { src: source?.id ?? '', network: popNetwork },
    { enabled: Boolean(source), refetchInterval: 30 * 1_000 },
  );
  const routes = React.useMemo(
    () => (source ? (recentPops.data ?? []) : []),
    [source, recentPops.data],
  );

  const isProxied = network === 'proxied';
  const cloudflareLocations = trpc.probes.cloudflareLocations.useQuery(
    undefined,
    { enabled: isProxied, staleTime: 60 * 60 * 1_000 },
  );
  const cfLocations = React.useMemo(
    () => (isProxied ? (cloudflareLocations.data ?? []) : []),
    [isProxied, cloudflareLocations.data],
  );

  const cfPointById = React.useMemo(() => {
    const byId = new Map<string, LngLat>();
    for (const location of cfLocations) {
      byId.set(location.iata, [location.lon, location.lat]);
    }
    return byId;
  }, [cfLocations]);

  const hitCfPops = React.useMemo(() => {
    const ids = new Set<string>();
    for (const route of routes) {
      if (route.cfPop) ids.add(route.cfPop);
    }
    return ids;
  }, [routes]);

  const cfPops = React.useMemo<FeatureCollection<Point, CfPopProperties>>(
    () => ({
      type: 'FeatureCollection',
      features: cfLocations.map((location) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [location.lon, location.lat] },
        properties: {
          iata: location.iata,
          city: location.city,
          inUse: hitCfPops.has(location.iata),
        },
      })),
    }),
    [cfLocations, hitCfPops],
  );

  const arcs = React.useMemo(() => {
    if (!source) return null;
    if (
      isProxied &&
      cfPointById.size > 0 &&
      routes.some((route) => route.cfPop)
    )
      return probeCfPopArcsGeoJSON(source, routes, cfPointById, pops, regions);
    if (routes.length > 0)
      return probePopArcsGeoJSON(source, routes, pops, regions);
    return probeArcsGeoJSON(source, regions);
  }, [source, isProxied, cfPointById, routes, pops, regions]);

  const hitPopIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const route of routes) {
      const pop = matchPopByHikari(route.hikariPop, pops);
      if (pop) ids.add(pop.id);
    }
    return ids;
  }, [routes, pops]);

  const dimUnhitPops = source != null && hitPopIds.size > 0;

  const showCfPops = isProxied && cfPops.features.length > 0;

  const interactiveLayerIds = React.useMemo(() => {
    const ids: string[] = [];
    if (arcs) ids.push('arc-hit');
    if (showCfPops) ids.push('cfpop-circles');
    return ids.length > 0 ? ids : undefined;
  }, [arcs, showCfPops]);

  const handleArcHover = React.useCallback((event: MapLayerMouseEvent) => {
    const cfFeature = event.features?.find(
      (layerFeature) => layerFeature.layer.id === 'cfpop-circles',
    );
    if (cfFeature && cfFeature.geometry.type === 'Point') {
      const attrs = cfFeature.properties ?? {};
      const key = `cf:${attrs.iata ?? ''}`;
      if (key === arcKeyRef.current) return;
      arcKeyRef.current = key;
      setArcTip(null);
      const [lng, lat] = cfFeature.geometry.coordinates;
      setCfTip({ lng, lat, iata: attrs.iata, city: attrs.city });
      return;
    }

    const feature = event.features?.find(
      (layerFeature) => layerFeature.layer.id === 'arc-hit',
    );
    if (!feature) {
      if (arcKeyRef.current !== null) {
        arcKeyRef.current = null;
        setArcTip(null);
        setCfTip(null);
      }
      return;
    }

    const attrs = feature.properties ?? {};
    const key = `${attrs.segment ?? 'region'}:${attrs.pop ?? attrs.region ?? ''}:${attrs.dst ?? ''}`;
    if (key === arcKeyRef.current) return;
    arcKeyRef.current = key;
    setCfTip(null);
    setArcTip({
      lng: event.lngLat.lng,
      lat: event.lngLat.lat,
      segment: attrs.segment,
      pop: attrs.pop,
      dst: attrs.dst,
      region: attrs.region,
      latencyMs: attrs.latencyMs ?? null,
      dests: attrs.dests ? (JSON.parse(attrs.dests) as ArcDestination[]) : [],
    });
  }, []);

  const handleMapMouseLeave = React.useCallback(() => {
    if (arcKeyRef.current !== null) {
      arcKeyRef.current = null;
      setArcTip(null);
      setCfTip(null);
    }
  }, []);

  React.useEffect(() => {
    if (!isProxied) setCfTip(null);
  }, [isProxied]);

  const flyToSelected = React.useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (!source) {
      map.easeTo({
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        duration: 300,
      });
      return;
    }

    map.flyTo({
      center: [source.lon, source.lat],
      zoom: Math.max(map.getZoom(), 3.4),
      duration: 1400,
      essential: true,
      padding: { top: 40, bottom: 40, left: 40, right: 560 },
    });
  }, [source]);

  React.useEffect(() => {
    flyToSelected();
  }, [flyToSelected]);

  const hoveredCity = hovered ? cityNameFromProbeId(hovered.probeId) : null;

  return (
    <Box position="relative" width="100%" height="100%">
      <MapGL
        ref={mapRef}
        mapStyle={MAP_STYLE_URL}
        initialViewState={{ longitude: 0, latitude: 25, zoom: 1.5 }}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        renderWorldCopies={false}
        interactiveLayerIds={interactiveLayerIds}
        onLoad={flyToSelected}
        onMouseMove={handleArcHover}
        onMouseLeave={handleMapMouseLeave}
      >
        <NavigationControl position="top-left" showCompass={false} />
        <AttributionControl position="bottom-left" compact />

        {arcs && (
          <Source id="arcs" type="geojson" data={arcs}>
            <Layer
              id="arc-glow"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': ARC_LINE_COLOR,
                'line-width': 4,
                'line-opacity': 0.12,
                'line-blur': 3,
              }}
            />
            <Layer
              id="arc-line"
              type="line"
              layout={{ 'line-cap': 'round' }}
              paint={{
                'line-color': ARC_LINE_COLOR,
                'line-width': 1.3,
                'line-opacity': 0.55,
                'line-dasharray': [1.5, 2],
              }}
            />
            <Layer
              id="arc-hit"
              type="line"
              paint={{ 'line-width': 14, 'line-opacity': 0 }}
            />
          </Source>
        )}

        {showCfPops && (
          <Source id="cfpops" type="geojson" data={cfPops}>
            <Layer
              id="cfpop-circles"
              type="circle"
              paint={{
                'circle-radius': ['case', ['get', 'inUse'], 5, 2.5],
                'circle-color': CF_POP_COLOR,
                'circle-opacity': ['case', ['get', 'inUse'], 0.95, 0.22],
                'circle-stroke-width': ['case', ['get', 'inUse'], 1.5, 0],
                'circle-stroke-color': 'rgba(255, 255, 255, 0.85)',
              }}
            />
          </Source>
        )}

        {pops.map((pop) => (
          <PopMarker
            key={`pop-${pop.id}`}
            pop={pop}
            highlighted={hitPopIds.has(pop.id)}
            dimmed={dimUnhitPops && !hitPopIds.has(pop.id)}
            onHover={setHoveredPop}
          />
        ))}

        {regions.map((marker) => (
          <RegionMarker
            key={`region-${marker.region}`}
            marker={marker}
            selected={marker.region === selectedRegion?.region}
            onHover={setHoveredRegion}
            onSelect={onSelectRegion}
          />
        ))}

        {probes.map((probe) => (
          <ProbeMarker
            key={probe.probeId}
            probe={probe}
            selected={probe.probeId === selectedProbeId}
            onHover={setHovered}
            onSelect={onSelectProbe}
          />
        ))}

        {hovered && (
          <Popup
            longitude={hovered.lon}
            latitude={hovered.lat}
            anchor="bottom"
            offset={18}
            closeButton={false}
            closeOnClick={false}
          >
            <Stack gap="1">
              <HStack gap="2">
                <Box
                  width="8px"
                  height="8px"
                  borderRadius="full"
                  backgroundColor={STATUS_COLOR[hovered.status]}
                />
                <Text fontFamily="mono" fontWeight="semibold">
                  {hovered.probeId}
                </Text>
              </HStack>
              {hoveredCity && (
                <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                  {hoveredCity}
                </Text>
              )}
              <Text
                fontSize="xs"
                color={STATUS_COLOR[hovered.status]}
                fontWeight="medium"
              >
                {STATUS_LABEL[hovered.status]}
              </Text>
            </Stack>
          </Popup>
        )}

        {!hovered && hoveredPop && (
          <Popup
            longitude={hoveredPop.geo.lon}
            latitude={hoveredPop.geo.lat}
            anchor="bottom"
            offset={18}
            closeButton={false}
            closeOnClick={false}
          >
            <Stack gap="1">
              <HStack gap="2">
                <Box
                  width="8px"
                  height="8px"
                  borderRadius="full"
                  backgroundColor={
                    hoveredPop.status === 'available'
                      ? POP_COLOR
                      : POP_DOWN_COLOR
                  }
                />
                <Text fontFamily="mono" fontWeight="semibold">
                  {hoveredPop.id}
                </Text>
              </HStack>
              <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                {hoveredPop.name}
              </Text>
              <Text
                fontSize="xs"
                color={
                  hoveredPop.status === 'available' ? POP_COLOR : POP_DOWN_COLOR
                }
                fontWeight="medium"
              >
                {hoveredPop.status}
              </Text>
            </Stack>
          </Popup>
        )}

        {!hovered && !hoveredPop && hoveredRegion && (
          <Popup
            longitude={hoveredRegion.lon}
            latitude={hoveredRegion.lat}
            anchor="bottom"
            offset={14}
            closeButton={false}
            closeOnClick={false}
          >
            <Stack gap="1">
              <HStack gap="2">
                <Box
                  width="8px"
                  height="8px"
                  borderRadius="full"
                  backgroundColor={REGION_COLOR}
                />
                <Text fontFamily="mono" fontWeight="semibold">
                  {hoveredRegion.region}
                </Text>
              </HStack>
              <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                Railway region
              </Text>
            </Stack>
          </Popup>
        )}

        {!hovered && !hoveredPop && !hoveredRegion && cfTip && (
          <Popup
            longitude={cfTip.lng}
            latitude={cfTip.lat}
            anchor="bottom"
            offset={12}
            closeButton={false}
            closeOnClick={false}
          >
            <Stack gap="0.5">
              <HStack gap="2">
                <Box
                  width="8px"
                  height="8px"
                  borderRadius="full"
                  backgroundColor={CF_POP_COLOR}
                />
                <Text fontFamily="mono" fontWeight="semibold">
                  {cfTip.iata}
                </Text>
              </HStack>
              <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                {cfTip.city} · Cloudflare
              </Text>
            </Stack>
          </Popup>
        )}

        {!hovered && !hoveredPop && !hoveredRegion && !cfTip && arcTip && (
          <Popup
            longitude={arcTip.lng}
            latitude={arcTip.lat}
            anchor="bottom"
            offset={12}
            closeButton={false}
            closeOnClick={false}
          >
            {arcTip.segment === 'pop-region' && (
              <Stack gap="0.5">
                <Text fontFamily="mono" fontWeight="semibold">
                  {arcTip.pop} → {arcTip.dst}
                </Text>
                <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                  {formatLatency(arcTip.latencyMs)}
                </Text>
              </Stack>
            )}

            {arcTip.segment != null && arcTip.segment !== 'pop-region' && (
              <Stack gap="1">
                <Text fontFamily="mono" fontWeight="semibold">
                  via {arcTip.pop}
                </Text>
                <Stack gap="0.5">
                  {arcTip.dests.map((dest) => (
                    <HStack
                      key={dest.dst}
                      gap="4"
                      justifyContent="space-between"
                    >
                      <Text fontSize="xs">{dest.dst}</Text>
                      <Text fontSize="xs" color="hsl(0, 0%, 70%)">
                        {formatLatency(dest.latencyMs)}
                      </Text>
                    </HStack>
                  ))}
                </Stack>
              </Stack>
            )}

            {!arcTip.segment && (
              <Text fontFamily="mono" fontWeight="semibold">
                → {arcTip.region}
              </Text>
            )}
          </Popup>
        )}
      </MapGL>
    </Box>
  );
}
