import { InfluxDB } from '@influxdata/influxdb-client';

import { env } from '@/env';

export const influxDB = new InfluxDB({
  url: env.INFLUXDB_URL,
  token: env.INFLUXDB_TOKEN,
});

export const queryAPI = influxDB.getQueryApi(env.INFLUXDB_ORG);
export const writeAPI = influxDB.getWriteApi(
  env.INFLUXDB_ORG,
  env.INFLUXDB_BUCKET,
);
