import type { RouterOutputs } from '@/utils/trpc';

export type Alert = RouterOutputs['alerts']['data'][number];

export type Severity = Alert['severity'];

export const SEVERITY_RANK: Record<Severity, number> = {
  warning: 0,
  high: 1,
  critical: 2,
};

export const SEVERITY_PALETTE: Record<Severity, string> = {
  warning: 'yellow',
  high: 'orange',
  critical: 'red',
};

export function worstSeverity(alerts: Alert[]): Severity | null {
  if (alerts.length === 0) return null;
  return alerts.reduce<Severity>(
    (worst, alert) =>
      SEVERITY_RANK[alert.severity] > SEVERITY_RANK[worst]
        ? alert.severity
        : worst,
    'warning',
  );
}
