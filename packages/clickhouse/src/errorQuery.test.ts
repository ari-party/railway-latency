import { describe, expect, it } from 'vitest';

import { buildErrorAggregateSql } from '@/errorQuery';

describe('buildErrorAggregateSql', () => {
  it('buckets and parameterises the error window query', () => {
    const { sql, params } = buildErrorAggregateSql({
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 10_000,
    });
    expect(sql).toContain('FROM error_events');
    expect(sql).toContain('argMax(reason, time) AS reason');
    expect(sql).toContain('network = {network:String}');
    expect(sql).not.toMatch(/probe-ams|europe-west4/);
    expect(params).toMatchObject({ network: 'public', windowMs: 10_000 });
  });
});
