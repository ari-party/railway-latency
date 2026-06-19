import { describe, expect, it } from 'vitest';

import { buildMtrEventRow } from '@/mtrRows';

import type { ProbeSample } from '@railway-latency/types';

const sample: ProbeSample = {
  measurement: 'httpPublic',
  dst: 'europe-west4',
  time: 1_700_000_000_000,
  ms: 9,
  mtr: [{ hop: 1, ip: '10.0.0.1', ms: 1.2 }],
};

describe('buildMtrEventRow', () => {
  it('serialises hops to JSON and carries the network', () => {
    const row = buildMtrEventRow('probe-ams', sample, 'public');
    expect(row).toEqual({
      time: '2023-11-14 22:13:20.000',
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      hops: '[{"hop":1,"ip":"10.0.0.1","ms":1.2}]',
    });
  });

  it('serialises an empty array when mtr is absent', () => {
    const without: ProbeSample = { ...sample, mtr: undefined };
    expect(buildMtrEventRow('probe-ams', without, 'public').hops).toBe('[]');
  });
});
