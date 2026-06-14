import { describe, expect, it } from 'vitest';

import { fullTimestamp, hasDrift, relativeTime, shortSha } from '@/lib/format';

const NOW = new Date('2026-06-12T12:00:00.000Z').getTime();

function isoSecondsAgo(seconds: number): string {
  return new Date(NOW - seconds * 1000).toISOString();
}

describe('relativeTime', () => {
  it('reports "never" for a missing or unparseable timestamp', () => {
    expect(relativeTime(null, NOW)).toBe('never');
    expect(relativeTime('not-a-date', NOW)).toBe('never');
  });

  it('renders seconds, minutes, hours and days at the right boundaries', () => {
    expect(relativeTime(isoSecondsAgo(12), NOW)).toBe('12s');
    expect(relativeTime(isoSecondsAgo(59), NOW)).toBe('59s');
    expect(relativeTime(isoSecondsAgo(60), NOW)).toBe('1m');
    expect(relativeTime(isoSecondsAgo(60 * 90), NOW)).toBe('1h');
    expect(relativeTime(isoSecondsAgo(3600 * 26), NOW)).toBe('1d');
  });

  it('clamps a future timestamp to "0s" rather than going negative', () => {
    expect(relativeTime(isoSecondsAgo(-30), NOW)).toBe('0s');
  });
});

describe('fullTimestamp', () => {
  it('formats a parseable timestamp as a UTC wall clock string', () => {
    expect(fullTimestamp('2026-06-12T12:34:56.789Z')).toBe(
      '2026-06-12 12:34:56 UTC',
    );
  });

  it('reports "never" for a missing or unparseable timestamp', () => {
    expect(fullTimestamp(null)).toBe('never');
    expect(fullTimestamp('not-a-date')).toBe('never');
  });
});

describe('hasDrift', () => {
  it('flags drift only when both shas are known and differ', () => {
    expect(hasDrift('aaaaaaa', 'bbbbbbb')).toBe(true);
    expect(hasDrift('aaaaaaa', 'aaaaaaa')).toBe(false);
  });

  it('does not flag drift when either sha is unknown', () => {
    expect(hasDrift(null, 'bbbbbbb')).toBe(false);
    expect(hasDrift('aaaaaaa', null)).toBe(false);
    expect(hasDrift(null, null)).toBe(false);
  });
});

describe('shortSha', () => {
  it('truncates to seven characters and empties a null sha', () => {
    expect(shortSha('0a1b2c3d4e5f')).toBe('0a1b2c3');
    expect(shortSha(null)).toBe('');
  });
});
