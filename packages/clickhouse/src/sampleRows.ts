import { toClickHouseDateTime } from '@/clickhouseTime';

import type { ProbeSample } from '@railway-latency/types';

export interface SampleRow {
  time: string;
  src: string;
  dst: string;
  measurement: string;
  origin: string;
  ms: number;
  railway_edge: string;
  cf_pop: string;
  hikari_pop: string;
}

export function buildSampleRow(
  src: string,
  sample: ProbeSample,
  origin: string,
): SampleRow {
  return {
    time: toClickHouseDateTime(sample.time),
    src,
    dst: sample.dst,
    measurement: sample.measurement,
    origin,
    ms: sample.ms,
    railway_edge: sample.railwayEdge ?? '',
    cf_pop: sample.cfPop ?? '',
    hikari_pop: sample.hikariPop ?? '',
  };
}
