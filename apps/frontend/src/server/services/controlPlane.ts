import ky from 'ky';

import { env } from '@/env';

import type { KyInstance } from 'ky';

export const controlPlane: KyInstance | null = env.CONTROL_PLANE_URL
  ? ky.create({
      prefixUrl: env.CONTROL_PLANE_URL,
      headers: env.CONTROL_PLANE_INTERNAL_TOKEN
        ? { 'X-Internal-Token': env.CONTROL_PLANE_INTERNAL_TOKEN }
        : undefined,
      throwHttpErrors: false,
    })
  : null;
