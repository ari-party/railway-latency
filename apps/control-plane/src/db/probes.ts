import { deriveDisplayStatus, toMapStatus } from '@railway-latency/utils';

import { query } from '@/db/pool';

import type {
  LifecycleStatus,
  ProbeMetadata,
  RosterProbe,
  RosterStatus,
  SeenEntry,
} from '@railway-latency/types';

export interface ProbeRow {
  probeId: string;
  lat: number;
  lon: number;
  apiKeyHash: Buffer | null;
  apiKeyPrefix: string | null;
  prevApiKeyHash: Buffer | null;
  prevKeyPrefix: string | null;
  prevKeyExpiresAt: string | null;
  host: string;
  deployedSha: string | null;
  status: string;
  lastSeen: string | null;
  createdAt: string;
  updatedAt: string;
}

interface RawProbeRow {
  probe_id: string;
  lat: number;
  lon: number;
  api_key_hash: Buffer | null;
  api_key_prefix: string | null;
  prev_api_key_hash: Buffer | null;
  prev_key_prefix: string | null;
  prev_key_expires_at: string | null;
  host: string;
  deployed_sha: string | null;
  status: string;
  last_seen: string | null;
  created_at: string;
  updated_at: string;
}

function mapProbe(row: RawProbeRow): ProbeRow {
  return {
    probeId: row.probe_id,
    lat: row.lat,
    lon: row.lon,
    apiKeyHash: row.api_key_hash,
    apiKeyPrefix: row.api_key_prefix,
    prevApiKeyHash: row.prev_api_key_hash,
    prevKeyPrefix: row.prev_key_prefix,
    prevKeyExpiresAt: row.prev_key_expires_at,
    host: row.host,
    deployedSha: row.deployed_sha,
    status: row.status,
    lastSeen: row.last_seen,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const ALL_COLUMNS = `probe_id, lat, lon,
  api_key_hash, api_key_prefix, prev_api_key_hash, prev_key_prefix, prev_key_expires_at,
  host, deployed_sha, status, last_seen,
  created_at, updated_at`;

export interface CreateProbeInput {
  probeId: string;
  lat: number;
  lon: number;
  host: string;
}

export async function createProbe(input: CreateProbeInput): Promise<ProbeRow> {
  const result = await query<RawProbeRow>(
    `insert into probes (probe_id, lat, lon, host)
     values ($1, $2, $3, $4)
     returning ${ALL_COLUMNS}`,
    [input.probeId, input.lat, input.lon, input.host],
  );
  return mapProbe(result.rows[0]);
}

export async function getProbe(probeId: string): Promise<ProbeRow | null> {
  const result = await query<RawProbeRow>(
    `select ${ALL_COLUMNS} from probes where probe_id = $1`,
    [probeId],
  );
  return result.rows[0] ? mapProbe(result.rows[0]) : null;
}

export async function listProbes(): Promise<ProbeRow[]> {
  const result = await query<RawProbeRow>(
    `select ${ALL_COLUMNS} from probes order by created_at desc`,
  );
  return result.rows.map(mapProbe);
}

export interface PatchProbeInput {
  lat?: number;
  lon?: number;
  host?: string;
}

const PATCH_COLUMNS: Record<keyof PatchProbeInput, string> = {
  lat: 'lat',
  lon: 'lon',
  host: 'host',
};

export async function patchProbe(
  probeId: string,
  input: PatchProbeInput,
): Promise<ProbeRow | null> {
  const assignments: string[] = [];
  const values: unknown[] = [];
  for (const [key, column] of Object.entries(PATCH_COLUMNS)) {
    const value = input[key as keyof PatchProbeInput];
    if (value === undefined) continue;
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  if (assignments.length === 0) return getProbe(probeId);

  values.push(probeId);

  const result = await query<RawProbeRow>(
    `update probes set ${assignments.join(', ')}, updated_at = now()
     where probe_id = $${values.length}
     returning ${ALL_COLUMNS}`,
    values,
  );
  return result.rows[0] ? mapProbe(result.rows[0]) : null;
}

export interface SetApiKeyInput {
  hash: Buffer;
  prefix: string;
  rotate?: boolean;
}

export async function setProbeApiKey(
  probeId: string,
  input: SetApiKeyInput,
): Promise<void> {
  if (input.rotate) {
    await query(
      `update probes set
         prev_api_key_hash = api_key_hash,
         prev_key_prefix = api_key_prefix,
         prev_key_expires_at = now() + interval '1 hour',
         api_key_hash = $2,
         api_key_prefix = $3,
         updated_at = now()
       where probe_id = $1`,
      [probeId, input.hash, input.prefix],
    );
    return;
  }
  await query(
    `update probes set
       api_key_hash = $2,
       api_key_prefix = $3,
       updated_at = now()
     where probe_id = $1`,
    [probeId, input.hash, input.prefix],
  );
}

export async function markActiveIfEnrolled(probeId: string): Promise<void> {
  await query(
    `update probes set status = 'active', updated_at = now()
     where probe_id = $1 and status = 'enrolled'`,
    [probeId],
  );
}

export async function revokeProbeKey(probeId: string): Promise<void> {
  await query(
    `update probes set
       status = 'revoked',
       prev_api_key_hash = null,
       prev_key_prefix = null,
       prev_key_expires_at = null,
       updated_at = now()
     where probe_id = $1`,
    [probeId],
  );
}

export async function disableProbe(probeId: string): Promise<void> {
  await query(
    `update probes set status = 'disabled', updated_at = now() where probe_id = $1`,
    [probeId],
  );
}

export async function setDeployedSha(
  probeId: string,
  sha: string,
): Promise<void> {
  await query(
    `update probes set deployed_sha = $2, updated_at = now() where probe_id = $1`,
    [probeId, sha],
  );
}

export async function deleteProbe(probeId: string): Promise<void> {
  await query('delete from probes where probe_id = $1', [probeId]);
}

export async function getRoster(): Promise<RosterProbe[]> {
  const result = await query<{
    probe_id: string;
    api_key_hash: Buffer;
    api_key_prefix: string;
    prev_api_key_hash: Buffer | null;
    prev_key_prefix: string | null;
    prev_key_expires_at: string | null;
    lat: number;
    lon: number;
    status: string;
  }>(
    `select probe_id, api_key_hash, api_key_prefix,
            prev_api_key_hash, prev_key_prefix, prev_key_expires_at,
            lat, lon, status
     from probes
     where status <> 'created' and api_key_hash is not null`,
  );

  const now = Date.now();
  return result.rows.map((row) => {
    const prevAlive =
      row.prev_key_expires_at !== null &&
      new Date(row.prev_key_expires_at).getTime() > now;
    return {
      probeId: row.probe_id,
      apiKeyHash: row.api_key_hash.toString('hex'),
      apiKeyPrefix: row.api_key_prefix,
      ...(prevAlive && row.prev_api_key_hash && row.prev_key_prefix
        ? {
            previousApiKeyHash: row.prev_api_key_hash.toString('hex'),
            previousApiKeyPrefix: row.prev_key_prefix,
          }
        : {}),
      lat: row.lat,
      lon: row.lon,
      status: row.status as RosterStatus,
    };
  });
}

export async function getMapRoster(): Promise<ProbeMetadata[]> {
  const result = await query<{
    probe_id: string;
    lat: number;
    lon: number;
    status: string;
    last_seen: string | null;
  }>(
    `select probe_id, lat, lon, status, last_seen
     from probes order by probe_id`,
  );
  return result.rows.map((row) => ({
    probeId: row.probe_id,
    lat: row.lat,
    lon: row.lon,
    status: toMapStatus(
      deriveDisplayStatus(row.status as LifecycleStatus, row.last_seen),
    ),
  }));
}

export async function advanceLastSeen(entries: SeenEntry[]): Promise<void> {
  if (entries.length === 0) return;

  await query(
    `update probes set last_seen = greatest(coalesce(last_seen, 'epoch'), to_timestamp(incoming.ts / 1000.0))
     from unnest($1::text[], $2::bigint[]) as incoming(probe_id, ts)
     where probes.probe_id = incoming.probe_id`,
    [entries.map((entry) => entry.probeId), entries.map((entry) => entry.ts)],
  );
}
