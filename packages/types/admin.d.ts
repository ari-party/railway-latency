export type LifecycleStatus =
  | 'created'
  | 'enrolled'
  | 'active'
  | 'revoked'
  | 'disabled';

export interface Probe {
  probeId: string;
  lat: number;
  lon: number;
  status: LifecycleStatus;
  deployedSha: string | null;
  host: string;
  lastSeen: string | null;
}

export interface CreateProbeInput {
  probeId: string;
  lat: number;
  lon: number;
  host: string;
}

export interface ProbeEnrollment {
  probeId?: string;
  enrollToken: string;
  installCommand: string;
}

export interface PatchProbeInput {
  lat?: number;
  lon?: number;
  host?: string;
}

export interface PatchedProbe {
  probeId: string;
  lat: number;
  lon: number;
  status: LifecycleStatus;
}

export interface RotatedKey {
  apiKey: string;
}

export interface AdminKey {
  id: string;
  label: string;
  publicKey: string;
  enabled: boolean;
  createdAt: string;
}

export interface CreateAdminKeyInput {
  label: string;
  publicKey: string;
}

export interface LatestRelease {
  sha: string | null;
}

export interface UpdateAllResult {
  started: number;
}

export interface UpdateProbeResult {
  started: boolean;
}
