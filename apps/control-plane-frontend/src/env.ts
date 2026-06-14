import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

export const env = createEnv({
  server: {
    CONTROL_PLANE_URL: z
      .string()
      .url()
      .default('http://localhost:3000')
      .transform((value) => value.replace(/\/$/, '')),
    CONTROL_PLANE_INTERNAL_TOKEN: z.string().default(''),
  },

  client: {},

  runtimeEnv: {
    CONTROL_PLANE_URL: process.env.CONTROL_PLANE_URL,
    CONTROL_PLANE_INTERNAL_TOKEN: process.env.CONTROL_PLANE_INTERNAL_TOKEN,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
