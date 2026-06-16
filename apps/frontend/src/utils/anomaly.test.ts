import { describe, expect, it } from 'vitest';

import { deriveStatus, statusColorToken } from '@/utils/anomaly';

import type { QueryResultLine } from '@railway-latency/types';

describe('deriveStatus', () => {
  const lines = (rows: Array<[string, string, string]>): QueryResultLine[] =>
    rows as QueryResultLine[];

  it('is ok when every measurement stays within the threshold', () => {
    expect(
      deriveStatus(
        lines([
          ['http', '2026-06-16T00:00:00.000Z', '120'],
          ['dns', '2026-06-16T00:00:00.000Z', '20'],
          ['handshake', '2026-06-16T00:00:00.000Z', '60'],
        ]),
      ),
    ).toBe('ok');
  });

  it('is elevated when a non-HTTP measurement runs sustained-high', () => {
    expect(
      deriveStatus(
        lines([
          ['http', '2026-06-16T00:00:00.000Z', '120'],
          ['http', '2026-06-16T00:01:00.000Z', '130'],
          ['handshake', '2026-06-16T00:00:00.000Z', '900'],
          ['handshake', '2026-06-16T00:01:00.000Z', '950'],
        ]),
      ),
    ).toBe('elevated');
  });

  it('is elevated when HTTP runs sustained-high', () => {
    expect(
      deriveStatus(
        lines([
          ['http', '2026-06-16T00:00:00.000Z', '900'],
          ['http', '2026-06-16T00:01:00.000Z', '1100'],
        ]),
      ),
    ).toBe('elevated');
  });

  it('stays ok for a lone transient spike whose median is within threshold', () => {
    expect(
      deriveStatus(
        lines([
          ['http', '2026-06-16T00:00:00.000Z', '100'],
          ['http', '2026-06-16T00:01:00.000Z', '100'],
          ['http', '2026-06-16T00:02:00.000Z', '5000'],
        ]),
      ),
    ).toBe('ok');
  });

  it('is down with no usable points', () => {
    expect(deriveStatus(lines([]))).toBe('down');
  });
});

describe('statusColorToken', () => {
  it('maps statuses to color tokens', () => {
    expect(statusColorToken('ok')).toBe('blue.400');
    expect(statusColorToken('elevated')).toBe('orange.400');
    expect(statusColorToken('down')).toBe('red.500');
  });
});
