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

    DATABASE_URL: z.string(),

    CONTROL_PLANE_INTERNAL_TOKEN: z.string(),

    AUTOMATION_SSH_KEY_B64: z.string(),

    PUBLIC_BASE_URL: z.string(),

    INGEST_URL: z.string(),

    GITHUB_REPO: z.string().default('ari-party/railway-latency'),

    RAILWAY_ENVIRONMENT_NAME: z.string().default('prod'),

    RAILWAY_REGION_SLUGS: csvToArray,
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
