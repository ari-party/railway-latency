export type Network = 'private' | 'public' | 'proxied';

export type Measurement =
  | 'http'
  | 'dns'
  | 'handshake'
  | 'httpPublic'
  | 'httpPublicHikari'
  | 'dnsPublic'
  | 'handshakePublic'
  | 'httpProxied'
  | 'httpProxiedHikari'
  | 'dnsProxied'
  | 'handshakeProxied';

export interface ProbeSample {
  measurement: Measurement;
  dst: string;
  time: number;
  ms: number;
  railwayEdge?: string;
  cfPop?: string;
  hikariPop?: string;
}

export interface ErrorEvent {
  dst: string;
  network: Network;
  time: number;
  reason: string;
}
