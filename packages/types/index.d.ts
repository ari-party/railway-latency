export type ProbeMeasurement = Record<'http' | 'dns', number | null>;

export type ProbeResults = Record<string, ProbeMeasurement>;

export type ProbeResultsDictionary = Record<string, ProbeResults>;

export type Network = 'private' | 'public' | 'proxied';

export type NetworkResultsDictionary = Record<Network, ProbeResultsDictionary>;

export type Measurement =
  | 'http'
  | 'dns'
  | 'httpPublic'
  | 'dnsPublic'
  | 'httpProxied'
  | 'dnsProxied';

export interface ProbeSample {
  measurement: Measurement;
  dst: string;
  time: number;
  ms: number;
}

export type QueryResultLine = [
  measurement: Measurement,
  time: string,
  valueStr: string,
];
