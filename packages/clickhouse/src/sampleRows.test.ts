import { describe, expect, it } from 'vitest';

import { buildSampleRow } from '@/sampleRows';

import type { ProbeSample } from '@railway-latency/types';

const sample: ProbeSample = {
  measurement: 'httpPublicHikari',
  dst: 'europe-west4',
  time: 1_700_000_000_000,
  ms: 12.5,
  railwayEdge: 'railway/europe-west4',
  cfPop: 'AMS',
  hikariPop: 'ams1',
};

describe('buildSampleRow', () => {
  it('maps a probe sample into a ClickHouse sample row', () => {
    expect(buildSampleRow('probe-ams', sample, 'external')).toEqual({
      time: '2023-11-14 22:13:20.000',
      src: 'probe-ams',
      dst: 'europe-west4',
      measurement: 'httpPublicHikari',
      origin: 'external',
      ms: 12.5,
      railway_edge: 'railway/europe-west4',
      cf_pop: 'AMS',
      hikari_pop: 'ams1',
    });
  });

  it('defaults missing routing fields to empty strings', () => {
    const minimal: ProbeSample = {
      measurement: 'http',
      dst: 'europe-west4',
      time: 1_700_000_000_000,
      ms: 4,
    };
    const row = buildSampleRow('probe-ams', minimal, 'internal');
    expect(row.railway_edge).toBe('');
    expect(row.cf_pop).toBe('');
    expect(row.hikari_pop).toBe('');
  });
});
