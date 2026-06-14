import { query } from '@/db/pool';

export interface AdminKeyRow {
  id: string;
  label: string;
  publicKey: string;
  enabled: boolean;
  createdAt: string;
}

export async function createAdminKey(
  label: string,
  publicKey: string,
): Promise<AdminKeyRow> {
  const result = await query<{
    id: string;
    label: string;
    public_key: string;
    enabled: boolean;
    created_at: string;
  }>(
    `insert into admin_keys (label, public_key) values ($1, $2)
     returning id, label, public_key, enabled, created_at`,
    [label, publicKey],
  );

  const row = result.rows[0];

  return {
    id: row.id,
    label: row.label,
    publicKey: row.public_key,
    enabled: row.enabled,
    createdAt: row.created_at,
  };
}

export async function listAdminKeys(): Promise<AdminKeyRow[]> {
  const result = await query<{
    id: string;
    label: string;
    public_key: string;
    enabled: boolean;
    created_at: string;
  }>(
    `select id, label, public_key, enabled, created_at from admin_keys order by created_at`,
  );
  return result.rows.map((row) => ({
    id: row.id,
    label: row.label,
    publicKey: row.public_key,
    enabled: row.enabled,
    createdAt: row.created_at,
  }));
}

export async function listEnabledAdminKeys(): Promise<string[]> {
  const result = await query<{ public_key: string }>(
    `select public_key from admin_keys where enabled = true order by created_at`,
  );
  return result.rows.map((row) => row.public_key);
}

export async function deleteAdminKey(id: string): Promise<boolean> {
  const result = await query('delete from admin_keys where id = $1', [id]);
  return (result.rowCount ?? 0) > 0;
}
