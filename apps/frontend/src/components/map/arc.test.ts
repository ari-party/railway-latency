import { describe, expect, it } from 'vitest';

import {
  arcCurve,
  latencyColor,
  splitAtAntimeridian,
} from '@/components/map/arc';

describe('arcCurve', () => {
  it('starts at the origin and ends at the destination', () => {
    const arc = arcCurve({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }, 16);
    expect(arc[0][0]).toBeCloseTo(0);
    expect(arc[0][1]).toBeCloseTo(0);
    expect(arc[arc.length - 1][0]).toBeCloseTo(90);
    expect(arc[arc.length - 1][1]).toBeCloseTo(0);
  });

  it('returns segments + 1 points', () => {
    expect(
      arcCurve({ lat: 10, lon: 20 }, { lat: -30, lon: 100 }, 32),
    ).toHaveLength(33);
  });

  it('bows away from the straight chord', () => {
    const arc = arcCurve({ lat: 40, lon: -70 }, { lat: 40, lon: 10 }, 16);
    const midpoint = arc[Math.floor(arc.length / 2)];
    expect(midpoint[1]).toBeGreaterThan(40);
  });

  it('collapses to a single point when from equals to', () => {
    expect(arcCurve({ lat: 5, lon: 5 }, { lat: 5, lon: 5 })).toEqual([[5, 5]]);
  });

  it('stays on-screen for a near-antipodal pair (no pole spike, in bounds)', () => {
    const arc = arcCurve({ lat: 39, lon: -77 }, { lat: 1.3, lon: 103.8 }, 48);
    for (const [lon, lat] of arc) {
      expect(Math.abs(lon)).toBeLessThanOrEqual(180.001);
      expect(Math.abs(lat)).toBeLessThan(80);
    }
  });
});

describe('splitAtAntimeridian', () => {
  it('splits a Pacific-crossing arc into two in-bounds segments', () => {
    const parts = splitAtAntimeridian(
      arcCurve({ lat: 20, lon: 150 }, { lat: 20, lon: -150 }, 32),
    );
    expect(parts).toHaveLength(2);
    for (const part of parts)
      for (const [lon] of part)
        expect(Math.abs(lon)).toBeLessThanOrEqual(180.001);
  });

  it('leaves a non-crossing arc as one segment', () => {
    const parts = splitAtAntimeridian(
      arcCurve({ lat: 0, lon: 0 }, { lat: 0, lon: 40 }, 16),
    );
    expect(parts).toHaveLength(1);
  });
});

describe('latencyColor', () => {
  it('maps low latency to green and high to red', () => {
    expect(latencyColor(5)).toBe('#16a34a');
    expect(latencyColor(300)).toBe('#ef4444');
  });

  it('steps through the scale across thresholds', () => {
    expect(latencyColor(30)).toBe('#22c55e');
    expect(latencyColor(120)).toBe('#eab308');
    expect(latencyColor(200)).toBe('#f59e0b');
  });
});
