import { describe, expect, it } from 'vitest';

import { buildProbeRecentPopsSql } from '@/probePops';

describe('buildProbeRecentPopsSql', () => {
  it('groups non-empty pops by destination within the window', () => {
    const { sql, params } = buildProbeRecentPopsSql({
      src: 'probe-iad',
      network: 'public',
      sinceMs: 1_700_000_000_000,
    });

    expect(sql).toContain('FROM check_events');
    expect(sql).toContain('cf_pop AS cfPop');
    expect(sql).toContain('GROUP BY dst, cf_pop, hikari_pop');
    expect(sql).toContain("hikari_pop != ''");
    expect(sql).toContain(
      'check_events.time >= fromUnixTimestamp64Milli({sinceMs:Int64})',
    );
    expect(sql).toContain('toUInt32(count()) AS hits');
    expect(sql).toContain('round(avgOrNull(http_ms)) AS latencyMs');
    expect(params).toEqual({
      src: 'probe-iad',
      network: 'public',
      sinceMs: 1_700_000_000_000,
    });
  });

  it('parameterizes src and network and never inlines their values', () => {
    const { sql } = buildProbeRecentPopsSql({
      src: 'probe-iad',
      network: 'proxied',
      sinceMs: 1,
    });

    expect(sql).toContain('src = {src:String}');
    expect(sql).toContain('network = {network:String}');
    expect(sql).not.toMatch(/probe-iad|proxied/);
  });
});
