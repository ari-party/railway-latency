import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

const csvToArray = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

export const env = createEnv({
  server: {
    NODE_ENV: z.string().default('development'),

    PORT: z
      .string()
      .default('3000')
      .transform((value) => parseInt(value, 10))
      .pipe(z.number()),

    INFLUXDB_URL: z.string(),
    INFLUXDB_TOKEN: z.string(),
    INFLUXDB_ORG: z.string(),
    INFLUXDB_BUCKET: z.string(),

    CONTROL_PLANE_URL: z.string(),
    CONTROL_PLANE_INTERNAL_TOKEN: z.string(),

    ROSTER_REFRESH_MS: z
      .string()
      .default('45000')
      .transform(Number)
      .pipe(z.number()),

    MAX_FUTURE_SKEW_MS: z
      .string()
      .default('60000')
      .transform(Number)
      .pipe(z.number()),

    BUFFER_RETENTION_MS: z
      .string()
      .default('86400000')
      .transform(Number)
      .pipe(z.number()),

    RAILWAY_REPLICA_REGIONS: csvToArray,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
