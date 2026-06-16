import { describe, expect, it } from 'vitest';

import {
  computeAdaptiveYMax,
  NORMAL_FLOOR_MS,
  percentile,
} from '@/utils/chartScale';

describe('percentile', () => {
  it('returns the value at the given quantile of sorted input', () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([5], 0.95)).toBe(5);
    expect(percentile([], 0.95)).toBeNull();
  });
});

describe('computeAdaptiveYMax', () => {
  it('floors at the normal band when everything is calm', () => {
    expect(computeAdaptiveYMax([40, 60, 90, 120])).toBe(NORMAL_FLOOR_MS);
  });

  it('scales to a sustained elevated level (stable ~1s reads clearly)', () => {
    const stable1s = Array.from({ length: 50 }, () => 1000);
    expect(computeAdaptiveYMax(stable1s)).toBe(1000);
  });

  it('clamps a lone rare outlier instead of blowing out the axis', () => {
    const data = [...Array.from({ length: 999 }, () => 120), 58000];
    expect(computeAdaptiveYMax(data)).toBe(NORMAL_FLOOR_MS);
  });

  it('expands beyond the floor when spikes are frequent', () => {
    const data = [
      ...Array.from({ length: 96 }, () => 120),
      ...Array.from({ length: 4 }, () => 3000),
    ];
    expect(computeAdaptiveYMax(data)).toBe(3000);
  });

  it('rounds the cap up to a clean step', () => {
    const data = Array.from({ length: 50 }, () => 1230);
    expect(computeAdaptiveYMax(data)).toBe(1250);
  });

  it('returns the floor for empty input', () => {
    expect(computeAdaptiveYMax([])).toBe(NORMAL_FLOOR_MS);
  });
});
