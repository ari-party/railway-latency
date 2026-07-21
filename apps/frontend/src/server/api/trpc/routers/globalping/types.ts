export type GlobalpingType = 'http' | 'mtr';

export interface GlobalpingLocationSelection {
  continent?: string;
  country?: string;
  city?: string;
  network?: string;
}

export interface GlobalpingProbeLocation {
  continent: string;
  region: string;
  country: string;
  state: string | null;
  city: string;
  asn: number;
  network: string;
  lat: number;
  lon: number;
}

export interface GlobalpingHttpTimings {
  total: number | null;
  dns: number | null;
  tcp: number | null;
  tls: number | null;
  firstByte: number | null;
  download: number | null;
}

export interface GlobalpingMtrHop {
  resolvedHostname: string | null;
  resolvedAddress: string | null;
  asn: number[];
  min: number | null;
  avg: number | null;
  max: number | null;
  loss: number | null;
}

export interface GlobalpingProbeResult {
  probe: GlobalpingProbeLocation;
  status: 'finished' | 'failed';
  statusCode?: number | null;
  timings?: GlobalpingHttpTimings | null;
  headers?: Record<string, string>;
  hikariPop?: string | null;
  railwayEdge?: string | null;
  cfPop?: string | null;
  hops?: GlobalpingMtrHop[];
}

export interface GlobalpingResult {
  id: string;
  type: GlobalpingType;
  dst: string;
  target: string;
  location: GlobalpingLocationSelection;
  createdAt: number;
  probes: GlobalpingProbeResult[];
}

export interface GlobalpingSummary {
  id: string;
  type: GlobalpingType;
  dst: string;
  location: GlobalpingLocationSelection;
  probeCount: number;
  createdAt: number;
}

export interface LocationTree {
  continents: Array<{
    code: string;
    name: string;
    probeCount: number;
    countries: Array<{
      code: string;
      probeCount: number;
      cities: Array<{ name: string; probeCount: number }>;
    }>;
  }>;
  networks: Array<{ name: string; probeCount: number }>;
}
