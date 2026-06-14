export type RosterStatus = 'enrolled' | 'active' | 'revoked' | 'disabled';

export interface RosterProbe {
  probeId: string;
  apiKeyPrefix: string;
  apiKeyHash: string;
  previousApiKeyPrefix?: string;
  previousApiKeyHash?: string;
  lat: number;
  lon: number;
  status: RosterStatus;
}

export interface SeenEntry {
  probeId: string;
  ts: number;
}
