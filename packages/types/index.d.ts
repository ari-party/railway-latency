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

export interface MtrHop {
  hop: number;
  ip: string | null;
  hostname: string | null;
  avgMs: number | null;
  lossPct: number;
}

export interface MtrRoute {
  hops: MtrHop[];
}

export interface MtrProbe {
  time: number;
  routes: Record<string, MtrRoute>;
}

export interface GeoInfo {
  lat: number | null;
  lng: number | null;
  city: string | null;
  country: string | null;
  isp: string | null;
  asn: string | null;
}

export type GeoHop = MtrHop & GeoInfo;

export interface GeoRoute {
  time: number;
  hops: GeoHop[];
}

export type MtrResultsDictionary = Record<string, Record<string, GeoRoute>>;
