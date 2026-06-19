import { describe, expect, it } from 'vitest';

import { buildErrorEventRow } from '@/errorRows';

import type { ErrorEvent } from '@railway-latency/types';

const event: ErrorEvent = {
  dst: 'europe-west4',
  network: 'public',
  time: 1_700_000_000_000,
  reason: 'connection reset',
};

describe('buildErrorEventRow', () => {
  it('maps an error event into a ClickHouse error row', () => {
    expect(buildErrorEventRow('probe-ams', event, 'external')).toEqual({
      time: '2023-11-14 22:13:20.000',
      src: 'probe-ams',
      dst: 'europe-west4',
      network: 'public',
      origin: 'external',
      reason: 'connection reset',
    });
  });
});
