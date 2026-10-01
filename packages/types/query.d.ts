import type { Measurement } from './wire';

export type ProbeMeasurement = Record<
  'http' | 'dns' | 'handshake',
  number | null
>;

export type QueryResultLine = [
  measurement: Measurement,
  time: string,
  valueStr: string,
];

export type QueryErrorLine = [time: string, reason: string];
