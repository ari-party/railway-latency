import { describe, expect, it } from 'vitest';

import { toClickHouseDateTime } from '@/clickhouseTime';

describe('toClickHouseDateTime', () => {
  it('formats epoch millis as a zoneless ClickHouse datetime literal', () => {
    expect(toClickHouseDateTime(1_700_000_000_000)).toBe(
      '2023-11-14 22:13:20.000',
    );
  });
});
