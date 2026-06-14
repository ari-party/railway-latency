import { InfluxDB } from '@influxdata/influxdb-client';

import type { WriteApi, WriteOptions } from '@influxdata/influxdb-client';

export interface WriteApiConfig {
  url: string;
  token: string;
  org: string;
  bucket: string;
  writeOptions?: Partial<WriteOptions>;
}

export function createWriteApi(config: WriteApiConfig): WriteApi {
  const influxDB = new InfluxDB({ url: config.url, token: config.token });
  return influxDB.getWriteApi(
    config.org,
    config.bucket,
    'ms',
    config.writeOptions,
  );
}
