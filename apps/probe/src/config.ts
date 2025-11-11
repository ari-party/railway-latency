import { createEnv } from '@t3-oss/env-core';
import { z } from 'zod';

import regions from '@config/regions.json';

export { regions };
export type Region = (typeof regions)[number];

export const env = createEnv({
  server: {
    NODE_ENV: z.string().default('development'),

    PORT: z
      .string()
      .default('3000')
      .transform((v) => parseInt(v, 10))
      .pipe(z.number()),

    RAILWAY_REPLICA_REGION: z.string().default(regions[0]),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
