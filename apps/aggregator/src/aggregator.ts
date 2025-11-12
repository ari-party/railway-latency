import { Point } from '@influxdata/influxdb-client';
import ky from 'ky';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { writeAPI } from '@/influxdb';
import { log } from '@/pino';

type Results = Record<string, number | null>;
interface ProbeResults {
  http: Results;
  dns: Results;
}
interface Probe extends ProbeResults {
  time: number;
}

function getEmptyResults(region: string) {
  const empty = Object.fromEntries(
    env.RAILWAY_REPLICA_REGIONS.filter((subRegion) => subRegion !== region).map(
      (subRegion) => [subRegion, null],
    ),
  );

  return {
    http: empty,
    dns: empty,
  } satisfies ProbeResults;
}

const lastResults: Record<string, ProbeResults> = Object.fromEntries(
  env.RAILWAY_REPLICA_REGIONS.map((region) => [
    region,
    getEmptyResults(region),
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
    log.error(
      { name: 'Aggregator', ...err },
      `Failed to get probe from ${region}`,
    );
    return null;
  });
  if (!response || !response.ok) return null;

  return response.json<Probe>();
}

setIntervalAsync(async () => {
  const probes = await Promise.all(
    env.RAILWAY_REPLICA_REGIONS.map(getRegionProbe),
  );

  for (let i = 0; i < env.RAILWAY_REPLICA_REGIONS.length; i += 1) {
    const region = env.RAILWAY_REPLICA_REGIONS[i];
    const probe = probes[i];

    lastResults[region] = {
      [region]: null,
      ...((probe
        ? { http: probe.http, dns: probe.dns }
        : getEmptyResults(region)) satisfies ProbeResults),
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
}, 1_000);

export const getLastResults = () => lastResults;
