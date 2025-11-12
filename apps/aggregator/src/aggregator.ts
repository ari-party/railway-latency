import { Point } from '@influxdata/influxdb-client';
import {
  getEmptyProbeResults,
  getEmptyProbeResultsDictionary,
} from '@railway-latency/utils';
import ky from 'ky';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { writeAPI } from '@/influxdb';
import { log } from '@/pino';

import type { Probe } from '@railway-latency/types';

const lastResults = getEmptyProbeResultsDictionary(env.RAILWAY_REPLICA_REGIONS);

const probeAPIs = Object.fromEntries(
  env.RAILWAY_REPLICA_REGIONS.map((region) => [
    region,
    ky.create({
      prefixUrl: `http://${region}.railway.internal:8080`,
      throwHttpErrors: false,
      timeout: 500,
    }),
  ]),
);

async function getRegionProbe(region: string): Promise<Probe | null> {
  const response = await probeAPIs[region].get('probe').catch((err) => {
    log.error(err, `Failed to get probe from ${region}`);
    return null;
  });
  if (!response || !response.ok) return null;

  return response.json<Probe>();
}

async function aggregate() {
  const probeResults = await Promise.allSettled(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionProbe),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const region = env.RAILWAY_REPLICA_REGIONS[i];
    const probeResult = probeResults[i];
    const probe =
      probeResult.status === 'fulfilled' && probeResult.value !== null
        ? probeResult.value
        : null;

    const baseResults = getEmptyProbeResults(env.RAILWAY_REPLICA_REGIONS);

    if (!probe) {
      lastResults[region] = baseResults;
      continue;
    }

    const { time, results: measurements } = probe;

    for (const [subRegion, measurement] of Object.entries(measurements)) {
      if (!measurement) continue;

      if (!baseResults[subRegion])
        baseResults[subRegion] = {
          http: null,
          dns: null,
        };

      baseResults[subRegion] = {
        http: measurement.http ?? null,
        dns: measurement.dns ?? null,
      };
    }

    lastResults[region] = baseResults;

    const httpPoints: Point[] = [];
    const dnsPoints: Point[] = [];

    for (const [subRegion, measurement] of Object.entries(measurements)) {
      if (!measurement) continue;

      if (measurement.http !== null && measurement.http !== undefined) {
        httpPoints.push(
          new Point('http')
            .tag('src', region)
            .tag('dst', subRegion)
            .floatField('ms', measurement.http)
            .timestamp(new Date(time)),
        );
      }

      if (measurement.dns !== null && measurement.dns !== undefined) {
        dnsPoints.push(
          new Point('dns')
            .tag('src', region)
            .tag('dst', subRegion)
            .floatField('ms', measurement.dns)
            .timestamp(new Date(time)),
        );
      }
    }

    if (httpPoints.length > 0) writeAPI.writePoints(httpPoints);
    if (dnsPoints.length > 0) writeAPI.writePoints(dnsPoints);
  }
}

// Not calling aggregate immediately here as there were previously timeout errors
setIntervalAsync(aggregate, 1_000);

export const getLastResults = () => lastResults;
