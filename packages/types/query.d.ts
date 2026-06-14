import type { Measurement, Network } from './wire';

export type ProbeMeasurement = Record<
  'http' | 'dns' | 'handshake',
  number | null
>;

export type ProbeResults = Record<string, ProbeMeasurement>;

export type ProbeResultsDictionary = Record<string, ProbeResults>;

export type NetworkResultsDictionary = Record<Network, ProbeResultsDictionary>;

export type QueryResultLine = [
  measurement: Measurement,
  time: string,
  valueStr: string,
];

export type QueryErrorLine = [time: string, reason: string];
