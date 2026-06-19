import { describe, expect, it } from 'vitest';

import { buildLatestMtrSql } from '@/mtrQuery';

describe('buildLatestMtrSql', () => {
  it('selects the single most recent hop row since the cutoff', () => {
    const { sql, params } = buildLatestMtrSql({
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      sinceMs: 1_700_000_000_000,
    });
    expect(sql).toContain('FROM mtr_events');
    expect(sql).toContain('ORDER BY time DESC LIMIT 1');
    expect(sql).toContain('time >= fromUnixTimestamp64Milli({sinceMs:Int64})');
    expect(params).toMatchObject({
      network: 'public',
      sinceMs: 1_700_000_000_000,
    });
  });
});
