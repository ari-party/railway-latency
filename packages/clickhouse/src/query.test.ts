import { describe, expect, it } from 'vitest';

import { buildCheckQuerySql } from '@/query';

describe('buildCheckQuerySql', () => {
  it('builds a parameterized query with no filters', () => {
    const { sql, params } = buildCheckQuerySql({ filters: {}, limit: 100 });
    expect(sql).toContain('FROM check_events');
    expect(sql).toContain(
      'ORDER BY check_events.time DESC, src DESC, dst DESC, network DESC',
    );
    expect(sql).toContain('LIMIT {limit:UInt32}');
    expect(sql).not.toContain('WHERE');
    expect(params.limit).toBe(100);
  });

  it('parameterizes every filter and never inlines values', () => {
    const { sql, params } = buildCheckQuerySql({
      filters: {
        network: 'public',
        src: 'probe-iad',
        dst: 'europe-west4',
        edge: 'iad',
        cf: 'SJC',
        hikari: 'sin',
        failStage: 'http',
        status: { op: 'gte', value: 400 },
        hasBody: true,
        text: 'upstream',
      },
      from: 1_700_000_000_000,
      to: 1_700_000_100_000,
      cursor: {
        time: 1_700_000_050_000,
        src: 'probe-iad',
        dst: 'europe-west4',
        network: 'public',
      },
      limit: 50,
    });
    expect(sql).toContain('network = {network:String}');
    expect(sql).toContain('http_status >= {status:UInt16}');
    expect(sql).toContain("body != ''");
    expect(sql).toContain(
      '(check_events.time, src, dst, network) < (fromUnixTimestamp64Milli({cursorTime:Int64}), {cursorSrc:String}, {cursorDst:String}, {cursorNetwork:String})',
    );
    expect(sql).not.toMatch(/europe-west4|probe-iad|400/);
    expect(params).toMatchObject({
      network: 'public',
      status: 400,
      limit: 50,
      cursorTime: 1_700_000_050_000,
      cursorSrc: 'probe-iad',
      cursorDst: 'europe-west4',
      cursorNetwork: 'public',
    });
  });
});
