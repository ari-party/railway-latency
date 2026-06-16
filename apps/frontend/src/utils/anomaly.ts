import type { QueryResultLine } from '@railway-latency/types';

export const ELEVATED_MS = 250;

export type AnomalyStatus = 'ok' | 'elevated' | 'down';

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function deriveStatus(lines: QueryResultLine[]): AnomalyStatus {
  const valuesByType = new Map<string, number[]>();
  for (const [type, , valueStr] of lines) {
    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;

    const list = valuesByType.get(type) ?? [];
    list.push(value);
    valuesByType.set(type, list);
  }

  if (valuesByType.size === 0) return 'down';

  let worstTypical = 0;
  for (const values of valuesByType.values()) {
    const typical = median(values);
    if (typical != null && typical > worstTypical) worstTypical = typical;
  }

  return worstTypical > ELEVATED_MS ? 'elevated' : 'ok';
}

const STATUS_COLOR_TOKEN: Record<AnomalyStatus, string> = {
  ok: 'blue.400',
  elevated: 'orange.400',
  down: 'red.500',
};

export function statusColorToken(status: AnomalyStatus): string {
  return STATUS_COLOR_TOKEN[status];
}
