-- Débit — initial schema
-- Data model per BRD §7. Row-level security is keyed to auth.uid() on every
-- table: the app is single-user today, but opening it up later must not need a
-- migration.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerated vocabularies
--
-- The error taxonomy (BRD FR-5.1) is fixed and closed *at the database level*
-- on purpose: the trend charts in FR-8 depend on stable labels, so an invented
-- category must fail the insert rather than quietly widen the axis.
-- ---------------------------------------------------------------------------

create type expression_type as enum (
  'connector', 'collocation', 'verb_pattern', 'topical_lexis'
);

create type expression_register as enum ('formal', 'neutral', 'informal');

create type expression_source as enum ('user', 'generated');

create type rhetorical_function as enum (
  'annoncer', 'ajouter', 'nuancer_opposer', 'illustrer', 'conclure',
  'formules_de_politesse'
);

create type task_type as enum ('phrase', 'paragraphe', 'argument');

create type drill_mode as enum ('text', 'voice');

create type target_usage as enum ('absent', 'present_misused', 'present_correct');

create type latency_band as enum ('rapide', 'correct', 'lent');

create type error_category as enum (
  'article',
  'accord_genre_nombre',
  'accord_sujet_verbe',
  'que_qui',
  'subjonctif',
  'temps_verbal',
  'preposition',
  'negation',
  'ordre_des_mots',
  'orthographe'
);

create type review_state_name as enum ('new', 'learning', 'active');

create type scoring_status as enum ('pending', 'scored', 'failed');

-- ---------------------------------------------------------------------------
-- expression — the unit of learning (a chunk, not a word)
-- ---------------------------------------------------------------------------

create table expression (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users (id) on delete cascade,
  text                text not null check (length(btrim(text)) > 0),
  type                expression_type not null,
  register            expression_register not null default 'neutral',
  cefr                text not null default 'B2' check (cefr in ('A1','A2','B1','B2','C1','C2')),
  gloss_en            text,
  model_sentence      text,
  error_note          text,
  theme               text,
  -- Not in BRD §7's column list, but FR-7.1 groups the cheat sheet by
  -- rhetorical function, and deriving that at read time would be a per-render
  -- LLM call. Stored at enrichment time instead.
  rhetorical_function rhetorical_function,
  source              expression_source not null default 'user',
  archived_at         timestamptz,
  created_at          timestamptz not null default now()
);

-- FR-1.1 dedupe: case- and whitespace-insensitive, per user. Archived rows
-- still occupy the slot — re-pasting a word you archived should surface the
-- archived row, not create a second history.
create unique index expression_user_text_key
  on expression (user_id, lower(btrim(text)));

create index expression_user_archived_idx on expression (user_id, archived_at);

-- ---------------------------------------------------------------------------
-- prompt — a situation compatible with a specific set of expressions
-- ---------------------------------------------------------------------------

create table prompt (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  theme          text,
  task_type      task_type not null default 'phrase',
  statement_fr   text not null,
  expression_ids uuid[] not null default '{}',
  exposure_count integer not null default 0,
  created_at     timestamptz not null default now()
);

-- FR-2.4 caches prompts per expression-set, so the lookup is by that set.
create index prompt_lookup_idx on prompt (user_id, task_type, expression_ids);

-- ---------------------------------------------------------------------------
-- session
-- ---------------------------------------------------------------------------

create table session (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at   timestamptz,
  mode       drill_mode not null default 'text',
  item_count integer not null default 0
);

create index session_user_started_idx on session (user_id, started_at desc);

-- ---------------------------------------------------------------------------
-- attempt
-- ---------------------------------------------------------------------------

create table attempt (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  session_id        uuid references session (id) on delete set null,
  prompt_id         uuid references prompt (id) on delete set null,
  expression_ids    uuid[] not null default '{}',
  mode              drill_mode not null,

  raw_input         text,
  transcript        text,
  audio_url         text,
  -- BRD §8: audio is kept 30 days, only for reviewing bad transcriptions.
  audio_expires_at  timestamptz,

  latency_ms        integer,      -- prompt reveal -> submit (text) / -> record start (voice)
  speaking_ms       integer,      -- voice only: recording duration

  target_usage      jsonb not null default '{}'::jsonb,
  collocation_score smallint check (collocation_score between 0 and 3),
  grammar_score     smallint check (grammar_score between 0 and 3),
  latency_band      latency_band,
  corrected_text    text,
  key_fix           text,
  error_tags        error_category[] not null default '{}',
  missing_accents   boolean not null default false,
  hesitation_count  integer,

  -- FR-5.2: scoring is never blocking. A failed grade parks here for retry.
  scoring_status    scoring_status not null default 'pending',
  scoring_error     text,
  -- §11 risk: a bad Whisper transcript voids the grammar score but keeps latency.
  transcript_flagged boolean not null default false,

  created_at        timestamptz not null default now()
);

create index attempt_user_created_idx on attempt (user_id, created_at desc);
create index attempt_user_status_idx on attempt (user_id, scoring_status);
create index attempt_session_idx on attempt (session_id);
create index attempt_expressions_idx on attempt using gin (expression_ids);

-- ---------------------------------------------------------------------------
-- review_state — one row per expression, driven by the modified SM-2 in FR-6
-- ---------------------------------------------------------------------------

create table review_state (
  expression_id           uuid primary key references expression (id) on delete cascade,
  user_id                 uuid not null references auth.users (id) on delete cascade,
  ease                    real not null default 2.5,
  interval_days           real not null default 0,
  due_at                  timestamptz not null default now(),
  consecutive_fast_correct integer not null default 0,
  state                   review_state_name not null default 'new',
  last_attempt_id         uuid references attempt (id) on delete set null,
  -- FR-6.1 requires the two qualifying results to fall in *different sessions*
  -- and span at least one different prompt context, so both must be remembered.
  last_fast_session_id    uuid,
  last_fast_prompt_id     uuid,
  updated_at              timestamptz not null default now()
);

create index review_state_due_idx on review_state (user_id, due_at);
create index review_state_state_idx on review_state (user_id, state);

-- Every new expression starts life due immediately and in the 'new' state.
create function ensure_review_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into review_state (expression_id, user_id)
  values (new.id, new.user_id)
  on conflict (expression_id) do nothing;
  return new;
end;
$$;

create trigger expression_review_state_trg
  after insert on expression
  for each row execute function ensure_review_state();

-- ---------------------------------------------------------------------------
-- Daily snapshot of the state histogram, so FR-8 chart 2 ("count of
-- expressions by state, over time") has history rather than only "now".
-- ---------------------------------------------------------------------------

create table state_snapshot (
  user_id  uuid not null references auth.users (id) on delete cascade,
  day      date not null,
  new      integer not null default 0,
  learning integer not null default 0,
  active   integer not null default 0,
  primary key (user_id, day)
);

create function snapshot_states(p_user_id uuid) returns void
language sql security definer set search_path = public as $$
  insert into state_snapshot (user_id, day, new, learning, active)
  select
    p_user_id,
    current_date,
    count(*) filter (where rs.state = 'new'),
    count(*) filter (where rs.state = 'learning'),
    count(*) filter (where rs.state = 'active')
  from review_state rs
  join expression e on e.id = rs.expression_id
  where rs.user_id = p_user_id and e.archived_at is null
  on conflict (user_id, day) do update
    set new = excluded.new, learning = excluded.learning, active = excluded.active;
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table expression     enable row level security;
alter table prompt         enable row level security;
alter table session        enable row level security;
alter table attempt        enable row level security;
alter table review_state   enable row level security;
alter table state_snapshot enable row level security;

create policy expression_owner on expression
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy prompt_owner on prompt
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy session_owner on session
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy attempt_owner on attempt
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy review_state_owner on review_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy state_snapshot_owner on state_snapshot
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
