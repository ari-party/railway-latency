import { describe, expect, it } from 'vitest';

import { buildSampleAggregateSql } from '@/sampleQuery';

describe('buildSampleAggregateSql', () => {
  it('parameterises every value and never inlines them', () => {
    const { sql, params } = buildSampleAggregateSql({
      src: 'probe-ams',
      dst: 'europe-west4',
      measurements: ['httpPublic', 'httpPublicHikari'],
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 2_500,
    });
    expect(sql).toContain('FROM samples');
    expect(sql).toContain('measurement IN {measurements:Array(String)}');
    expect(sql).toContain('* {windowMs:Int64} + {windowMs:Int64} AS bucketMs');
    expect(sql).toContain('GROUP BY measurement, bucketMs');
    expect(sql).not.toMatch(/probe-ams|europe-west4|httpPublic/);
    expect(params).toMatchObject({
      src: 'probe-ams',
      dst: 'europe-west4',
      measurements: ['httpPublic', 'httpPublicHikari'],
      windowMs: 2_500,
    });
  });
});
