import { deriveDisplayStatus } from '@railway-latency/utils';

import type { DisplayStatus } from '@railway-latency/utils';

export { deriveDisplayStatus };
export type { DisplayStatus };

export const DISPLAY_STATUS_LABEL: Record<DisplayStatus, string> = {
  green: 'Online',
  stale: 'Stale',
  down: 'Down',
  pending: 'Pending',
  revoked: 'Revoked',
  disabled: 'Disabled',
};

export type StatusTone = 'green' | 'amber' | 'red' | 'neutral' | 'accent';

export const DISPLAY_STATUS_TONE: Record<DisplayStatus, StatusTone> = {
  green: 'green',
  stale: 'amber',
  down: 'red',
  pending: 'accent',
  revoked: 'red',
  disabled: 'neutral',
};
