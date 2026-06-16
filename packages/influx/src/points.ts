import { Point } from '@influxdata/influxdb-client';

import { MEASUREMENT_INFO } from '@/measurements';

import type { ErrorEvent, ProbeSample } from '@railway-latency/types';

interface PointOptions {
  origin?: string;
}

function sanitizeLineProtocolValue(value: string): string {
  return value.replace(/[\r\n\t]/g, ' ');
}

export function buildSamplePoint(
  src: string,
  sample: ProbeSample,
  options: PointOptions = {},
): Point {
  const point = new Point(sample.measurement)
    .tag('src', src)
    .tag('dst', sample.dst)
    .floatField('ms', sample.ms)
    .timestamp(new Date(sample.time));

  if (options.origin != null) point.tag('origin', options.origin);

  if (sample.railwayEdge != null)
    point.stringField(
      'railway_edge',
      sanitizeLineProtocolValue(sample.railwayEdge),
    );
  if (sample.cfPop != null)
    point.stringField('cf_pop', sanitizeLineProtocolValue(sample.cfPop));
  if (sample.hikariPop != null)
    point.stringField(
      'hikari_pop',
      sanitizeLineProtocolValue(sample.hikariPop),
    );

  return point;
}

export function buildMtrPoint(
  src: string,
  sample: ProbeSample,
  options: PointOptions = {},
): Point {
  const point = new Point('mtr')
    .tag('src', src)
    .tag('dst', sample.dst)
    .tag('network', MEASUREMENT_INFO[sample.measurement].net)
    .stringField(
      'hops',
      sanitizeLineProtocolValue(JSON.stringify(sample.mtr ?? [])),
    )
    .timestamp(new Date(sample.time));

  if (options.origin != null) point.tag('origin', options.origin);

  return point;
}

export function buildErrorPoint(
  src: string,
  error: ErrorEvent,
  options: PointOptions = {},
): Point {
  const point = new Point('error')
    .tag('src', src)
    .tag('dst', error.dst)
    .tag('network', error.network)
    .stringField('reason', sanitizeLineProtocolValue(error.reason))
    .timestamp(new Date(error.time));

  if (options.origin != null) point.tag('origin', options.origin);

  return point;
}
