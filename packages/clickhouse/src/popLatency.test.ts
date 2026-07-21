import { describe, expect, it } from 'vitest';

import {
  buildPopProbeLatencySql,
  buildPopProbeVolumeSql,
  buildRailwayPopsSql,
} from '@/popLatency';

describe('buildRailwayPopsSql', () => {
  it('scopes to public traffic with a non-empty pop and parameterises the window', () => {
    const { sql, params } = buildRailwayPopsSql({ sinceMs: 1_700_000_000_000 });
    expect(sql).toContain("network = 'public'");
    expect(sql).toContain("hikari_pop != ''");
    expect(sql).toContain('{sinceMs:Int64}');
    expect(sql).not.toMatch(/1700000/);
    expect(params).toEqual({ sinceMs: 1_700_000_000_000 });
  });
});

describe('buildPopProbeLatencySql', () => {
  it('groups by target region and omits the dst filter when targeting all regions', () => {
    const { sql, params } = buildPopProbeLatencySql({
      pop: 'ams1',
      dst: null,
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 10_000,
    });
    expect(sql).toContain('SELECT dst AS series');
    expect(sql).toContain("network = 'public'");
    expect(sql).toContain('quantile(0.95)(http_ms)');
    expect(sql).toContain('hikari_pop = {pop:String}');
    expect(sql).toContain('GROUP BY series, bucketMs');
    expect(sql).not.toContain('dst = {dst:String}');
    expect(params).not.toHaveProperty('dst');
  });

  it('groups by probe and filters to the region when a specific region is chosen', () => {
    const { sql, params } = buildPopProbeLatencySql({
      pop: 'fra2',
      dst: 'us-west2',
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 10_000,
    });
    expect(sql).toContain('SELECT src AS series');
    expect(sql).toContain('AND dst = {dst:String}');
    expect(sql).not.toMatch(/us-west2|fra2/);
    expect(params.dst).toBe('us-west2');
    expect(params.pop).toBe('fra2');
  });
});

describe('buildPopProbeVolumeSql', () => {
  it('counts public requests per probe and omits the dst filter for all regions', () => {
    const { sql, params } = buildPopProbeVolumeSql({
      pop: 'ams1',
      dst: null,
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 10_000,
    });
    expect(sql).toContain('SELECT src AS series');
    expect(sql).toContain('toUInt32(count()) AS count');
    expect(sql).toContain("network = 'public'");
    expect(sql).toContain('hikari_pop = {pop:String}');
    expect(sql).toContain('GROUP BY series, bucketMs');
    expect(sql).not.toContain('dst = {dst:String}');
    expect(params).not.toHaveProperty('dst');
  });

  it('filters to the chosen region while still grouping by probe', () => {
    const { sql, params } = buildPopProbeVolumeSql({
      pop: 'fra2',
      dst: 'us-west2',
      rangeStartMs: 1_700_000_000_000,
      rangeEndMs: 1_700_000_900_000,
      windowMs: 10_000,
    });
    expect(sql).toContain('SELECT src AS series');
    expect(sql).toContain('AND dst = {dst:String}');
    expect(sql).not.toMatch(/us-west2|fra2/);
    expect(params.dst).toBe('us-west2');
    expect(params.pop).toBe('fra2');
  });
});
