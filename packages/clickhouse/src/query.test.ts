import { describe, expect, it } from 'vitest';

import { parseCheckQuery } from '@/checkQuery';
import { buildCheckQuerySql } from '@/query';

describe('buildCheckQuerySql', () => {
  it('builds a parameterized query with no filters', () => {
    const { sql, params } = buildCheckQuerySql({
      query: parseCheckQuery(''),
      limit: 100,
    });
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
      query: parseCheckQuery(
        '@network:public @src:probe-iad @dst:europe-west4 @edge:iad ' +
          '@cf:SJC @hikari:sin @fail:http @status:>=400 @has:body upstream',
      ),
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
    expect(sql).toContain('network = {f0:String}');
    expect(sql).toContain('http_status >= {f7:UInt16}');
    expect(sql).toContain("body != ''");
    expect(sql).toContain(
      '(positionCaseInsensitive(reason, {f8:String}) > 0 OR positionCaseInsensitive(body, {f8:String}) > 0)',
    );
    expect(sql).toContain(
      '(check_events.time, src, dst, network) < (fromUnixTimestamp64Milli({cursorTime:Int64}), {cursorSrc:String}, {cursorDst:String}, {cursorNetwork:String})',
    );
    expect(sql).not.toMatch(/europe-west4|probe-iad|400|upstream/);
    expect(params).toMatchObject({
      f0: 'public',
      f7: 400,
      f8: 'upstream',
      limit: 50,
      from: 1_700_000_000_000,
      to: 1_700_000_100_000,
      cursorTime: 1_700_000_050_000,
      cursorSrc: 'probe-iad',
      cursorDst: 'europe-west4',
      cursorNetwork: 'public',
    });
  });
});
