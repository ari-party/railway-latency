import { describe, expect, it } from 'vitest';

import { buildFleetMetricsSql } from '@/fleetQuery';

describe('buildFleetMetricsSql', () => {
  it('parameterises every value and never inlines them', () => {
    const { sql, params } = buildFleetMetricsSql({
      network: 'private',
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 10_000,
    });
    expect(sql).toContain('FROM check_events');
    expect(sql).toContain('network = {network:String}');
    expect(sql).toContain('quantile(0.95)(http_ms)');
    expect(sql).toContain('countIf(http_status IS NOT NULL) AS completed');
    expect(sql).toContain(
      'map(toUInt16(coalesce(http_status, 0)), toUInt64(1)))) AS errorCounts',
    );
    expect(sql).toContain("countIf(fail_stage = 'handshake') AS failHandshake");
    expect(sql).toContain('GROUP BY bucketMs');
    expect(sql).not.toMatch(/private|1700000/);
    expect(params).toMatchObject({
      network: 'private',
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 10_000,
    });
  });
});
