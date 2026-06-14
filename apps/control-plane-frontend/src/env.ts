const DEFAULT_CONTROL_PLANE_API_URL = 'http://localhost:3000';

export const env = {
  CONTROL_PLANE_API_URL:
    process.env.CONTROL_PLANE_API_URL?.replace(/\/$/, '') ??
    DEFAULT_CONTROL_PLANE_API_URL,

  CONTROL_PLANE_INTERNAL_TOKEN: process.env.CONTROL_PLANE_INTERNAL_TOKEN ?? '',
};
