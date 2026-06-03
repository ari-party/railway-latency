import ky from 'ky';
import { clearIntervalAsync, setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { log } from '@/pino';

import type {
  GeoHop,
  GeoInfo,
  GeoRoute,
  MtrProbe,
  MtrResultsDictionary,
  MtrRoute,
} from '@railway-latency/types';

const POLL_INTERVAL_MS = 5 * 60 * 1_000;

const EMPTY_GEO: GeoInfo = {
  lat: null,
  lng: null,
  city: null,
  country: null,
  isp: null,
  asn: null,
};

const geoCache = new Map<string, GeoInfo>();

function isPrivateIp(ip: string): boolean {
  return (
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    /^127\./.test(ip) ||
    /^169\.254\./.test(ip) ||
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) ||
    ip === '::1' ||
    ip.startsWith('fe80:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd')
  );
}

async function geolocate(ip: string): Promise<GeoInfo> {
  const cached = geoCache.get(ip);
  if (cached) return cached;

  if (!env.IP2LOCATION_API_KEY || isPrivateIp(ip)) {
    geoCache.set(ip, EMPTY_GEO);
    return EMPTY_GEO;
  }

  try {
    const data = await ky
      .get('https://api.ip2location.io/', {
        searchParams: { key: env.IP2LOCATION_API_KEY, ip },
        timeout: 5_000,
        retry: 0,
      })
      .json<Record<string, unknown>>();

    const geo: GeoInfo = {
      lat: typeof data.latitude === 'number' ? data.latitude : null,
      lng: typeof data.longitude === 'number' ? data.longitude : null,
      city: typeof data.city_name === 'string' ? data.city_name : null,
      country: typeof data.country_name === 'string' ? data.country_name : null,
      isp: typeof data.as === 'string' ? data.as : null,
      asn: data.asn != null ? String(data.asn) : null,
    };

    geoCache.set(ip, geo);
    return geo;
  } catch (err) {
    log.error(err, `Failed to geolocate ${ip}`);
    return EMPTY_GEO;
  }
}

const mtrAPIs = Object.fromEntries(
  env.RAILWAY_REPLICA_REGIONS.map((region) => [
    region,
    ky.create({
      prefixUrl: `http://${region}.railway.internal:8080`,
      throwHttpErrors: false,
      timeout: 5_000,
    }),
  ]),
);

async function getRegionMtr(region: string): Promise<MtrProbe | null> {
  const response = await mtrAPIs[region].get('mtr').catch((err) => {
    log.error(err, `Failed to get mtr from ${region}`);
    return null;
  });
  if (!response || !response.ok) return null;

  return response.json<MtrProbe>();
}

async function enrichRoute(route: MtrRoute, time: number): Promise<GeoRoute> {
  const hops: GeoHop[] = [];
  for (const hop of route.hops) {
    const geo = hop.ip ? await geolocate(hop.ip) : EMPTY_GEO;
    hops.push({ ...hop, ...geo });
  }
  return { time, hops };
}

const lastResults: MtrResultsDictionary = {};
const lastSeenTime: Record<string, number> = {};

async function pollMtr() {
  const probes = await Promise.allSettled(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionMtr),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const region = env.RAILWAY_REPLICA_REGIONS[i];
    const probeResult = probes[i];
    const probe =
      probeResult.status === 'fulfilled' && probeResult.value !== null
        ? probeResult.value
        : null;
    if (!probe) continue;

    if (probe.time === lastSeenTime[region]) continue;
    lastSeenTime[region] = probe.time;

    const dstRoutes: Record<string, GeoRoute> = {};
    for (const [dst, route] of Object.entries(probe.routes))
      dstRoutes[dst] = await enrichRoute(route, probe.time);

    lastResults[region] = dstRoutes;
  }
}

const interval = setIntervalAsync(pollMtr, POLL_INTERVAL_MS);
pollMtr();

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals)
  process.on(signal, () => clearIntervalAsync(interval));

export const getLastMtr = (): MtrResultsDictionary => lastResults;
