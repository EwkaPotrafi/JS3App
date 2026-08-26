-- Flight log store. PostgreSQL; works unchanged on Supabase or Neon.
-- The phone is the source of truth for a flight until it syncs. The server
-- never invents rows, it only accepts upserts and hands back what is newer.

create table if not exists flights (
  id            uuid primary key,                 -- generated on the device
  owner         text        not null,             -- who this row belongs to
  registration  text        not null,
  serial        text,
  config        text        not null,             -- '18m' | '15m'
  date          date        not null,
  site          text,

  -- take-off state
  mass          numeric(7,2) not null,
  moment        numeric(8,3) not null,
  cg            numeric(7,2) not null,
  wing_loading  numeric(6,2) not null,

  -- state after expendable ballast is dumped
  dumped_mass   numeric(7,2),
  dumped_cg     numeric(7,2),

  -- the loading that produced it, so any flight can be recomputed later
  pilot         numeric(6,2),
  water_main    numeric(6,2),
  water_tips    numeric(6,2),
  loads         jsonb       not null default '{}'::jsonb,

  -- performance, for the trends
  duration_h    numeric(5,2),
  distance_km   numeric(7,1),
  avg_speed     numeric(6,1),
  conditions    text,
  notes         text,

  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

create index if not exists flights_owner_updated on flights (owner, updated_at desc);
create index if not exists flights_owner_date    on flights (owner, date desc);
create index if not exists flights_owner_reg     on flights (owner, registration, config);

-- Aircraft profiles, so a new phone can pull its arms and limits down.
create table if not exists profiles (
  id            text        primary key,          -- registration, e.g. 'N70JT'
  owner         text        not null,
  profile       jsonb       not null,
  updated_at    timestamptz not null default now()
);

-- Row level security, if you are on Supabase.
-- alter table flights  enable row level security;
-- alter table profiles enable row level security;
-- create policy own_flights on flights
--   for all using (owner = auth.uid()::text) with check (owner = auth.uid()::text);
