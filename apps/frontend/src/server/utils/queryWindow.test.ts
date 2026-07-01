import { describe, expect, it } from 'vitest';

import { getPopsQueryWindow, getQueryWindow } from '@/server/utils/queryWindow';

describe('getPopsQueryWindow', () => {
  it('aggregates into coarser buckets than the default window', () => {
    expect(getQueryWindow('3h').aggregateWindow).toBe('10s');
    expect(getPopsQueryWindow('3h').aggregateWindow).toBe('72s');
    expect(getPopsQueryWindow('7d').aggregateWindow).toBe('4032s');
  });

  it('never returns finer buckets than the default window', () => {
    // 15m default is 2.5s; the coarse window rounds to whole seconds and up.
    expect(getPopsQueryWindow('15m').aggregateWindow).toBe('6s');
  });
});
