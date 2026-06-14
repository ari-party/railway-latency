import { InfluxDB } from '@influxdata/influxdb-client';
import { createWriteApi } from '@railway-latency/influx';

import { env } from '@/env';
import { log } from '@/pino';

export const influxDB = new InfluxDB({
  url: env.INFLUXDB_URL,
  token: env.INFLUXDB_TOKEN,
});

export const queryAPI = influxDB.getQueryApi(env.INFLUXDB_ORG);
export const writeAPI = createWriteApi({
  url: env.INFLUXDB_URL,
  token: env.INFLUXDB_TOKEN,
  org: env.INFLUXDB_ORG,
  bucket: env.INFLUXDB_BUCKET,
});

let isShuttingDown = false;
async function onShutdown() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  await writeAPI
    .close()
    .then(() => log.info({ name: 'InfluxDB' }, 'Closed write API'))
    .catch((error) =>
      log.error({ name: 'InfluxDB', ...error }, 'Failed to close write API'),
    );

  process.exit(0);
}

const signals = ['SIGINT', 'SIGTERM'];
for (const signal of signals) process.on(signal, onShutdown);
