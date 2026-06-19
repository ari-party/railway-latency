import { describe, expect, it } from 'vitest';

import { parseFluxDurationMs } from '@/services/duration';

describe('parseFluxDurationMs', () => {
  it('parses the windows the chart router emits', () => {
    expect(parseFluxDurationMs('500ms')).toBe(500);
    expect(parseFluxDurationMs('2500ms')).toBe(2500);
    expect(parseFluxDurationMs('10s')).toBe(10_000);
    expect(parseFluxDurationMs('1h')).toBe(3_600_000);
  });

  it('throws on a malformed duration', () => {
    expect(() => parseFluxDurationMs('5 minutes')).toThrow();
  });
});
