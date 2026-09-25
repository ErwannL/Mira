-- Figura schema v1. Every run transition is audited; the runs table doubles as the job queue.
create table runs (
  id text primary key,
  kind text not null,
  status text not null,
  seed bigint not null,
  config jsonb not null,
  target_url text not null,
  catalogue_version text,
  weights_version text,
  target_version text,
  refusal_code text,
  refusal_message text,
  error text,
  summary jsonb,
  cancel_requested boolean not null default false,
  created_by text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz
);
create index runs_queue on runs (status, created_at);

create table run_transitions (
  id bigserial primary key,
  run_id text not null references runs (id) on delete cascade,
  from_status text,
  to_status text not null,
  at timestamptz not null default now(),
  actor text not null,
  note text
);

create table run_events (
  id bigserial primary key,
  run_id text not null references runs (id) on delete cascade,
  seq integer not null,
  persona_id text not null,
  kind text not null,
  use_case_id text,
  sim_time timestamptz not null,
  wall_time timestamptz not null,
  payload jsonb not null
);
create index run_events_run on run_events (run_id, seq);

create table persona_memory (
  run_id text not null references runs (id) on delete cascade,
  persona_id text not null,
  memory jsonb not null,
  credentials_enc text,
  updated_at timestamptz not null default now(),
  primary key (run_id, persona_id)
);

create table reports (
  run_id text not null references runs (id) on delete cascade,
  kind text not null,
  body jsonb not null,
  created_at timestamptz not null default now(),
  primary key (run_id, kind)
);

create table sessions (
  id_hash text primary key,
  operator text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table used_sso_tokens (
  hash text primary key,
  expires_at timestamptz not null
);

create table audit_log (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor text not null,
  action text not null,
  detail jsonb not null default '{}'
);

create table calibrations (
  id bigserial primary key,
  run_id text not null references runs (id) on delete cascade,
  uploaded_by text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);
