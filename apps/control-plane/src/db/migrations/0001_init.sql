create extension if not exists pgcrypto; -- gen_random_uuid()

create table if not exists probes (
  probe_id            text primary key
                        check (probe_id ~ '^[a-z0-9][a-z0-9-]*$'),
  lat                 double precision not null,
  lon                 double precision not null,
  api_key_hash        bytea,
  api_key_prefix      text,
  prev_api_key_hash   bytea,
  prev_key_prefix     text,
  prev_key_expires_at timestamptz,
  host                text,
  deployed_sha        text,
  status              text not null default 'created'
                        check (status in ('created','enrolled','active','revoked','disabled')),
  last_seen           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create unique index if not exists probes_api_key_prefix_idx
  on probes (api_key_prefix) where api_key_prefix is not null;
create index if not exists probes_status_idx on probes (status);

create table if not exists admin_keys (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  public_key  text not null unique,
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists enrollment_tokens (
  token_hash  bytea primary key,
  probe_id    text not null references probes(probe_id) on delete cascade,
  expires_at  timestamptz not null,
  used_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists enrollment_tokens_probe_idx on enrollment_tokens (probe_id);

create table if not exists events (
  id          bigserial primary key,
  -- Plain column, not an FK: the audit trail (including the deleted/force_deleted
  -- event itself) must survive deletion of the probe it refers to.
  probe_id    text,
  kind        text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index if not exists events_probe_idx on events (probe_id, created_at desc);
