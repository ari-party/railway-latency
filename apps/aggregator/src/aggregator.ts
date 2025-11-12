import { Point } from '@influxdata/influxdb-client';
import { getEmptyResults } from '@railway-latency/utils';
import ky from 'ky';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { writeAPI } from '@/influxdb';
import { log } from '@/pino';

import type {
  Probe,
  ProbeResults,
  ProbeResultsDictionary,
} from '@railway-latency/types';

const lastResults: ProbeResultsDictionary = Object.fromEntries(
  env.RAILWAY_REPLICA_REGIONS.map((region) => [
    region,
    getEmptyResults(region, env.RAILWAY_REPLICA_REGIONS),
  ]),
);

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

    lastResults[region] = {
      [region]: null,
      ...((probe
        ? { http: probe.http, dns: probe.dns }
        : getEmptyResults(
            region,
            env.RAILWAY_REPLICA_REGIONS,
          )) satisfies ProbeResults),
    };

    if (probe) {
      writeAPI.writePoints(
        Object.entries(probe.http)
          .filter(([, result]) => result !== null)
          .map(([subRegion, result]) =>
            new Point('http')
              .tag('src', region)
              .tag('dst', subRegion)
              .floatField('ms', result)
              .timestamp(new Date(probe.time)),
          ),
      );
      writeAPI.writePoints(
        Object.entries(probe.dns)
          .filter(([, result]) => result !== null)
          .map(([subRegion, result]) =>
            new Point('dns')
              .tag('src', region)
              .tag('dst', subRegion)
              .floatField('ms', result)
              .timestamp(new Date(probe.time)),
          ),
      );
    }
  }
}

// Not calling aggregate immediately here as there were previously timeout errors
setIntervalAsync(aggregate, 1_000);

export const getLastResults = () => lastResults;
