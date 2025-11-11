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

    RAILWAY_REPLICA_REGIONS: z
      .string()
      .default('')
      .transform((v) => v.trim().split(',')),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
