export type ProbeStatus = 'green' | 'stale' | 'down' | 'inactive';

export interface ProbeMetadata {
  probeId: string;
  lat: number;
  lon: number;
  status: ProbeStatus;
}
