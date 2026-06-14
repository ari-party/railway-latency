import { env } from '@/env';

export const internalTokenHeader = {
  'X-Internal-Token': env.CONTROL_PLANE_INTERNAL_TOKEN,
};
