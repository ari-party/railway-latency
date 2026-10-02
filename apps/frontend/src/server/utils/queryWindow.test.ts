import { describe, expect, it } from 'vitest';

import {
  getPopsQueryWindow,
  getQueryWindow,
  POPS_DETAIL_MAX_BUCKETS,
} from '@/server/utils/queryWindow';

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

  it('uses finer buckets for the detail charts', () => {
    expect(getPopsQueryWindow('3h', POPS_DETAIL_MAX_BUCKETS).windowMs).toBe(
      22 * 1_000,
    );
    expect(getPopsQueryWindow('7d', POPS_DETAIL_MAX_BUCKETS).windowMs).toBe(
      1_210 * 1_000,
    );
  });
});
