import { describe, expect, it } from 'vitest';

import { deriveDisplayStatus } from '@/lib/status';

const NOW = new Date('2026-06-12T12:00:00.000Z').getTime();

function isoSecondsAgo(seconds: number): string {
  return new Date(NOW - seconds * 1000).toISOString();
}

describe('deriveDisplayStatus', () => {
  it('reports revoked and disabled lifecycle states directly', () => {
    expect(deriveDisplayStatus('revoked', isoSecondsAgo(1), NOW)).toBe(
      'revoked',
    );
    expect(deriveDisplayStatus('disabled', isoSecondsAgo(1), NOW)).toBe(
      'disabled',
    );
  });

  it('treats created and enrolled probes as pending', () => {
    expect(deriveDisplayStatus('created', null, NOW)).toBe('pending');
    expect(deriveDisplayStatus('enrolled', isoSecondsAgo(1), NOW)).toBe(
      'pending',
    );
  });

  it('reports down for an active probe that has never been seen', () => {
    expect(deriveDisplayStatus('active', null, NOW)).toBe('down');
  });

  it('reports green within the stale threshold', () => {
    expect(deriveDisplayStatus('active', isoSecondsAgo(30), NOW)).toBe('green');
    expect(deriveDisplayStatus('active', isoSecondsAgo(59), NOW)).toBe('green');
  });

  it('reports stale between the stale and down thresholds', () => {
    expect(deriveDisplayStatus('active', isoSecondsAgo(61), NOW)).toBe('stale');
    expect(deriveDisplayStatus('active', isoSecondsAgo(299), NOW)).toBe(
      'stale',
    );
  });

  it('reports down past the down threshold', () => {
    expect(deriveDisplayStatus('active', isoSecondsAgo(301), NOW)).toBe('down');
  });

  it('uses the stale boundary inclusively at the down edge', () => {
    expect(deriveDisplayStatus('active', isoSecondsAgo(60), NOW)).toBe('stale');
    expect(deriveDisplayStatus('active', isoSecondsAgo(300), NOW)).toBe('down');
  });
});
