import { ZOD_RAILWAY_REPLICA_REGIONS as RAILWAY_REPLICA_REGIONS } from '@railway-latency/utils';
import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z.string().default('development'),

    PORT: z
      .string()
      .default('3000')
      .transform((v) => parseInt(v, 10))
      .pipe(z.number()),

    RAILWAY_REPLICA_REGION: z.string(),

    RAILWAY_REPLICA_REGIONS,

    ECHO_ENDPOINT: z.string().optional(),

    INTERNAL_AUTH_SECRET: z.string().optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
