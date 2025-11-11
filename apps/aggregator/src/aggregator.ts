import { Point } from '@influxdata/influxdb-client';
import ky from 'ky';
import { setIntervalAsync } from 'set-interval-async';

import { env } from '@/env';
import { writeAPI } from '@/influxdb';

function getEmptyResults(region: string) {
  return Object.fromEntries(
    env.RAILWAY_REPLICA_REGIONS.filter((subRegion) => subRegion !== region).map(
      (subRegion) => [subRegion, null],
    ),
  );
}

const lastResults: Record<
  string,
  Record<string, number | null>
> = Object.fromEntries(
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
    }),
  ]),
);

interface Probe {
  time: number;
  results: Record<string, number | null>;
}

async function getRegionProbe(region: string): Promise<Probe | null> {
  const response = await probeAPIs[region].get('probe');
  if (!response.ok) return null;

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
      ...(probe ? probe.results : getEmptyResults(region)),
    };

    if (probe)
      writeAPI.writePoints(
        Object.entries(probe.results)
          .filter(([, result]) => result !== null)
          .map(([subRegion, result]) =>
            new Point('latency')
              .tag('src', region)
              .tag('dst', subRegion)
              .floatField('ms', result)
              .timestamp(new Date(probe.time)),
          ),
      );
  }
}, 1_000);

export const getLastResults = () => lastResults;
