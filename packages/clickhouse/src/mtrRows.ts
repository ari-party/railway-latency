import { toClickHouseDateTime } from '@/clickhouseTime';

import type { ProbeSample } from '@railway-latency/types';

export interface MtrEventRow {
  time: string;
  src: string;
  dst: string;
  network: string;
  hops: string;
}

export function buildMtrEventRow(
  src: string,
  sample: ProbeSample,
  network: string,
): MtrEventRow {
  return {
    time: toClickHouseDateTime(sample.time),
    src,
    dst: sample.dst,
    network,
    hops: JSON.stringify(sample.mtr ?? []),
  };
}
