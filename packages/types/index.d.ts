export type ProbeMeasurement = Record<'http' | 'dns', number | null>;

export type ProbeResults = Record<string, ProbeMeasurement>;

export type ProbeResultsDictionary = Record<string, ProbeResults>;

export type Network = 'private' | 'public' | 'proxied';

export interface NetworkProbe {
  time: number;
  results: ProbeResults;
}

export interface Probe {
  private: NetworkProbe;
  public: NetworkProbe;
  proxied: NetworkProbe;
}

export type NetworkResultsDictionary = Record<Network, ProbeResultsDictionary>;

export type Measurement =
  | 'http'
  | 'dns'
  | 'httpPublic'
  | 'dnsPublic'
  | 'httpProxied'
  | 'dnsProxied';

export type QueryResultLine = [
  measurement: Measurement,
  time: string,
  valueStr: string,
];
