import { describe, expect, it } from 'vitest';

import { getPopsQueryWindow, getQueryWindow } from '@/server/utils/queryWindow';

describe('getPopsQueryWindow', () => {
  it('aggregates into coarser buckets than the default window', () => {
    expect(getQueryWindow('3h').windowMs).toBe(10 * 1_000);
    expect(getPopsQueryWindow('3h').windowMs).toBe(72 * 1_000);
    expect(getPopsQueryWindow('7d').windowMs).toBe(4_032 * 1_000);
  });

  it('never returns finer buckets than the default window', () => {
    // 15m default is 2.5s; the coarse window rounds to whole seconds and up.
    expect(getPopsQueryWindow('15m').windowMs).toBe(6 * 1_000);
  });
});
