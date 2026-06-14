import ky from 'ky';

import { env } from '@/env';

import type { KyInstance } from 'ky';

const controlPlaneHost = env.CONTROL_PLANE_HOST;

const controlPlaneProtocol =
  controlPlaneHost && controlPlaneHost.endsWith('railway.internal')
    ? 'http'
    : 'https';

const controlPlaneBaseUrl =
  controlPlaneHost != null
    ? `${controlPlaneProtocol}://${controlPlaneHost}:${env.CONTROL_PLANE_PORT}`
    : undefined;

export const controlPlane: KyInstance | null = controlPlaneBaseUrl
  ? ky.create({
      prefixUrl: controlPlaneBaseUrl,
      headers: env.CONTROL_PLANE_INTERNAL_TOKEN
        ? { 'X-Internal-Token': env.CONTROL_PLANE_INTERNAL_TOKEN }
        : undefined,
      throwHttpErrors: false,
    })
  : null;
