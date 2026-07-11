import { ZOD_RAILWAY_REPLICA_REGIONS } from '@railway-latency/utils';
import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(['development', 'test', 'production'])
      .default('development'),

    REDIS_URL: z.string().url().default('redis://localhost:6379'),

    AGGREGATOR_PORT: z
      .string()
      .default('8080')
      .transform((v) => parseInt(v, 10))
      .pipe(z.number()),
    AGGREGATOR_HOST: z.string().optional(),

    CONTROL_PLANE_URL: z.string().optional(),
    CONTROL_PLANE_INTERNAL_TOKEN: z.string().optional(),

    RAILWAY_REPLICA_REGIONS: ZOD_RAILWAY_REPLICA_REGIONS.optional(),

    APP_URL: z.string().url(),
    RAILWAY_OAUTH_CLIENT_ID: z.string(),
    RAILWAY_OAUTH_CLIENT_SECRET: z.string(),
    AUTH_SESSION_SECRET: z.string(),
    AUTH_ALLOWED_EMAILS: z.string(),
  },

  client: {},

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,

    REDIS_URL: process.env.REDIS_URL,

    AGGREGATOR_PORT: process.env.AGGREGATOR_PORT,
    AGGREGATOR_HOST: process.env.AGGREGATOR_HOST,

    CONTROL_PLANE_URL: process.env.CONTROL_PLANE_URL,
    CONTROL_PLANE_INTERNAL_TOKEN: process.env.CONTROL_PLANE_INTERNAL_TOKEN,

    RAILWAY_REPLICA_REGIONS: process.env.RAILWAY_REPLICA_REGIONS,

    APP_URL: process.env.APP_URL,
    RAILWAY_OAUTH_CLIENT_ID: process.env.RAILWAY_OAUTH_CLIENT_ID,
    RAILWAY_OAUTH_CLIENT_SECRET: process.env.RAILWAY_OAUTH_CLIENT_SECRET,
    AUTH_SESSION_SECRET: process.env.AUTH_SESSION_SECRET,
    AUTH_ALLOWED_EMAILS: process.env.AUTH_ALLOWED_EMAILS,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
