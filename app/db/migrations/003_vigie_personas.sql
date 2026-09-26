-- Personas pushed by Vigie (docs/VIGIE.md). Ids are `vigie-<name>`, never a catalogue persona id.
create table vigie_persona_sets (
  set_id text primary key,
  source_env text not null,
  target_env text not null,
  accepted integer not null,
  created_at timestamptz not null default now()
);

create table vigie_personas (
  id text primary key,
  set_id text not null references vigie_persona_sets (set_id),
  persona jsonb not null,
  updated_at timestamptz not null default now()
);
