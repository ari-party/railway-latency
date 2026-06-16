export const NORMAL_FLOOR_MS = 300;
const SCALE_PERCENTILE = 0.99;
const STEP_MS = 50;

export function percentile(
  values: readonly number[],
  quantile: number,
): number | null {
  const sorted = values
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];

  const position = quantile * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];

  const weight = position - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

export function computeAdaptiveYMax(
  values: readonly number[],
  floor: number = NORMAL_FLOOR_MS,
): number {
  const quantileValue = percentile(values, SCALE_PERCENTILE);
  if (quantileValue == null) return floor;
  return Math.max(floor, Math.ceil(quantileValue / STEP_MS) * STEP_MS);
}
