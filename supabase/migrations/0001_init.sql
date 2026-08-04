-- Level Set — initial schema (SPEC-object-model.md, SPEC-hard-rules.md)
-- The unit of persistence is the TOPIC. Documents are generated views, never memory.
-- Hard rules enforced here, not in copy:
--   R1  a fact without a source cannot be inserted (CHECK constraint)
--   R3  summary-only facts are barred from needs-you / waiting board (view filter)
--   R5  private layer is Paul-only via RLS, at the row level
--   R6  no stored day counts anywhere — aging is computed at render time

-- ── organizations (seed data, fixed) ─────────────────────────────────
create table organizations (
  id   text primary key,          -- FAM, BVH, PAN, CSI
  name text not null
);

-- ── topics ───────────────────────────────────────────────────────────
create table topics (
  id           text primary key,  -- short code e.g. PAN-01
  title        text not null,
  org_id       text not null references organizations (id),
  status       text not null default 'active'
               check (status in ('active', 'quiet', 'closed')),
  first_seen   timestamptz not null,
  last_updated timestamptz not null default now(),
  owner        text not null default 'paul',
  confidence   numeric not null default 1 check (confidence >= 0 and confidence <= 1),
  private      boolean not null default false
);

-- ── parties ──────────────────────────────────────────────────────────
create table parties (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  org_affiliation  text,
  emails           text[] not null default '{}',
  inbound_swept_at timestamptz,   -- HARD RULE 4: never show unresponsive without a fresh sweep
  inbound_result   text           -- e.g. 'silent', 'received'
);

-- ── conflict groups ──────────────────────────────────────────────────
-- Facts asserting the same datum with different values share a group.
-- Unresolved group ⇒ topic shows ▲ and downstream use is blocked.
create table conflict_groups (
  id             uuid primary key default gen_random_uuid(),
  topic_id       text not null references topics (id),
  datum          text,            -- what is contested, e.g. 'US Bank approval amount'
  resolved_at    timestamptz,
  winner_fact_id uuid             -- set on resolution; downstream corrections follow (S2/S3)
);

-- ── facts (topic event stream) ───────────────────────────────────────
create table facts (
  id             uuid primary key default gen_random_uuid(),
  topic_id       text not null references topics (id),
  occurred_at    timestamptz not null,
  body           text not null,
  kind           text not null check (kind in ('fact', 'inference', 'action', 'capture')),
  verification   text not null default 'verified'
                 check (verification in ('verified', 'summary_only')),
  -- HARD RULE 1: every fact cites its source. Insertion without one is a DB error.
  sources        jsonb not null
                 check (jsonb_typeof(sources) = 'array' and jsonb_array_length(sources) > 0),
  conflict_group uuid references conflict_groups (id)
);
create index facts_topic_occurred on facts (topic_id, occurred_at desc);

-- ── owed_items (the waiting board + needs-you + the pass) ────────────
create table owed_items (
  id             uuid primary key default gen_random_uuid(),
  topic_id       text not null references topics (id),
  direction      text not null check (direction in ('they_owe', 'paul_owes', 'self')),
  party_id       uuid references parties (id),
  description    text not null,
  refresher      text,            -- memory-jogger (prior commitments, own notes) written by ingestion
  -- HARD RULE 6: basis_date is immutable; days waiting = today - basis_date, computed, never stored.
  basis_date     date not null,
  committed_date date,            -- their own stated date
  state          text not null default 'open' check (state in ('open', 'blocked', 'done')),
  blocked_on     text,
  needs          text not null default 'none'
                 check (needs in ('decide', 'nudge', 'send', 'none')),
  due_bucket     text check (due_bucket in ('today', 'few_days', 'this_week', 'weekend')),
  owner          text not null default 'paul',
  last_chased_at timestamptz,
  chase_count    int not null default 0,
  deferred_at    timestamptz,     -- "Later" mark from the pass; persists across reloads
  source_fact_id uuid references facts (id)  -- provenance; also carries verification for R3
);
create index owed_items_topic on owed_items (topic_id);
create index owed_items_state on owed_items (state);

-- Basis dates never move (HARD RULE 6).
create or replace function forbid_basis_date_change() returns trigger as $$
begin
  if new.basis_date is distinct from old.basis_date then
    raise exception 'basis_date is immutable — day counts are computed from it and survive everything';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger owed_items_basis_immutable
  before update on owed_items
  for each row execute function forbid_basis_date_change();

-- ── runs (coverage strip) ────────────────────────────────────────────
create table runs (
  id               uuid primary key default gen_random_uuid(),
  started_at       timestamptz not null default now(),
  kind             text not null check (kind in ('full', 'incremental', 'manual')),
  coverage_grade   text not null,  -- A–F with modifiers; failures graded, never hidden (HARD RULE 7)
  sources          jsonb not null default '[]',
  raw_count        int not null default 0,
  kept_count       int not null default 0,
  suppressed_count int not null default 0,
  -- Run-generated "since last night" narrative. Deliberately avoids stored
  -- day counts — clocks referenced in it are rendered live by the client.
  since_summary    text
);

-- ── rules (corrections that persist — HARD RULE 9) ───────────────────
create table rules (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,       -- R-07…
  predicate  text not null,
  action     text not null,
  created_by text not null check (created_by in ('paul', 'katie', 'system')),
  fire_count int not null default 0
);

-- ── read_watermarks ──────────────────────────────────────────────────
create table read_watermarks (
  user_id  text not null,
  topic_id text not null references topics (id),
  read_to  timestamptz not null,
  primary key (user_id, topic_id)
);

-- ── drafts (action drawer — Stage 2 consumes; schema receives now) ───
create table drafts (
  id           uuid primary key default gen_random_uuid(),
  owed_item_id uuid not null references owed_items (id),
  channel      text not null check (channel in ('email', 'text', 'call_script')),
  version      int not null default 1,
  recipient    text,
  body         text not null,
  change_note  text,
  thread       jsonb not null default '[]'
);

-- ── settings ─────────────────────────────────────────────────────────
create table settings (
  key   text primary key,
  value jsonb not null
);
insert into settings (key, value) values
  ('aging_threshold_business_days', '5'),
  ('auto_rerun_after_pass', 'false');

-- ── meanwhile items (quiet updates on Home: team activity, stopped clocks) ──
create table meanwhile_items (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references runs (id),
  occurred_at timestamptz not null default now(),
  body        text not null,
  muted       boolean not null default false,  -- final "n more topics moved" style rows
  topic_id    text references topics (id),
  source_fact_id uuid references facts (id)
);

-- ── HARD RULE 3, enforced as a queryable view, not UI discipline ─────
-- needs_you view: open items that need Paul, EXCLUDING summary-only-sourced
-- items. The Home pass and Needs-You cards read from this.
-- security_invoker so the view respects the caller's RLS (a plain view would
-- run as its owner and leak private rows around the policies).
create view needs_you with (security_invoker = true) as
select oi.*
from owed_items oi
left join facts f on f.id = oi.source_fact_id
where oi.state = 'open'
  and oi.needs <> 'none'
  and coalesce(f.verification, 'verified') <> 'summary_only';

-- ── RLS: the private layer (HARD RULE 5) ─────────────────────────────
-- Private topics and everything hanging off them are Paul-only, enforced
-- at the row level. Katie's role and anon sessions never receive the rows.
alter table organizations   enable row level security;
alter table topics          enable row level security;
alter table parties         enable row level security;
alter table conflict_groups enable row level security;
alter table facts           enable row level security;
alter table owed_items      enable row level security;
alter table runs            enable row level security;
alter table rules           enable row level security;
alter table read_watermarks enable row level security;
alter table drafts          enable row level security;
alter table settings        enable row level security;
alter table meanwhile_items enable row level security;

create or replace function is_paul() returns boolean as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'paul@tbcsi.net';
$$ language sql stable;

-- Reference data: readable by all app roles.
create policy org_read      on organizations for select using (true);
create policy runs_read     on runs          for select using (true);
create policy rules_read    on rules         for select using (true);
create policy settings_read on settings      for select using (true);
create policy parties_read  on parties       for select using (true);

-- Topic-scoped data: non-private rows for everyone, private rows for Paul only.
create policy topics_read on topics for select
  using (not private or is_paul());
create policy facts_read on facts for select
  using (exists (select 1 from topics t where t.id = facts.topic_id and (not t.private or is_paul())));
create policy owed_read on owed_items for select
  using (exists (select 1 from topics t where t.id = owed_items.topic_id and (not t.private or is_paul())));
create policy conflict_read on conflict_groups for select
  using (exists (select 1 from topics t where t.id = conflict_groups.topic_id and (not t.private or is_paul())));
create policy drafts_read on drafts for select
  using (exists (
    select 1 from owed_items oi join topics t on t.id = oi.topic_id
    where oi.id = drafts.owed_item_id and (not t.private or is_paul())));
create policy meanwhile_read on meanwhile_items for select using (true);
create policy watermarks_read on read_watermarks for select using (true);

-- Stage 1 writes: triage marks (Done / Later) and their event-stream log.
-- Single-user surface today; anon key writes are limited to non-private topics.
-- Real per-user auth policies arrive with the operator role split.
create policy owed_write on owed_items for update
  using (exists (select 1 from topics t where t.id = owed_items.topic_id and (not t.private or is_paul())))
  with check (true);
create policy facts_write on facts for insert
  with check (exists (select 1 from topics t where t.id = facts.topic_id and (not t.private or is_paul())));
create policy watermarks_write on read_watermarks for insert with check (true);
create policy watermarks_update on read_watermarks for update using (true);
create policy runs_write on runs for insert with check (true);
