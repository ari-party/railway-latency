import React from 'react';

import type { RouterOutputs } from '@/utils/trpc';

export type Alert = RouterOutputs['alerts']['data'][number];

const STORAGE_KEY = 'alerts:dismissed';

export function alertKey(alert: Alert): string {
  return `${alert.kind}:${alert.src}->${alert.dst}:${alert.network}`;
}

// Routing alerts re-surface once a newer misroute arrives; latency alerts only
// re-surface after they clear and trip again (pruning handles that).
function alertSignature(alert: Alert): string {
  if (alert.kind === 'latency') return 'active';
  return `${alert.count}|${alert.lastTime}`;
}

function load(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function persist(state: Record<string, string>) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function useAlertDismissal(alerts: Alert[]) {
  const [dismissed, setDismissed] = React.useState<Record<string, string>>({});

  React.useEffect(() => setDismissed(load()), []);

  React.useEffect(() => {
    setDismissed((prev) => {
      const active = new Set(alerts.map(alertKey));
      const next = Object.fromEntries(
        Object.entries(prev).filter(([key]) => active.has(key)),
      );
      if (Object.keys(next).length === Object.keys(prev).length) return prev;
      persist(next);
      return next;
    });
  }, [alerts]);

  const isDismissed = React.useCallback(
    (alert: Alert) => dismissed[alertKey(alert)] === alertSignature(alert),
    [dismissed],
  );

  const dismiss = React.useCallback((alert: Alert) => {
    setDismissed((prev) => {
      const next = { ...prev, [alertKey(alert)]: alertSignature(alert) };
      persist(next);
      return next;
    });
  }, []);

  return { isDismissed, dismiss };
}
