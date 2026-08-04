-- 0003 · Auth gate — the hard gate before real data.
-- Every policy moves from anon-readable to authenticated-only. The private
-- layer (hard rule 5) is now real: rows on private topics exist only for
-- the session whose email is Paul's. Watermarks and triage marks are keyed
-- to the signed-in user's email.


-- The private layer is keyed to Paul's actual sign-in email.
create or replace function is_paul() returns boolean as $$
  select coalesce(auth.jwt() ->> 'email', '') = 'paul@cs-integrated.com';
$$ language sql stable;

-- ── drop the alpha-era anon policies ─────────────────────────────────
drop policy if exists org_read          on organizations;
drop policy if exists runs_read         on runs;
drop policy if exists rules_read        on rules;
drop policy if exists settings_read     on settings;
drop policy if exists parties_read      on parties;
drop policy if exists topics_read       on topics;
drop policy if exists facts_read        on facts;
drop policy if exists owed_read         on owed_items;
drop policy if exists conflict_read     on conflict_groups;
drop policy if exists drafts_read       on drafts;
drop policy if exists meanwhile_read    on meanwhile_items;
drop policy if exists watermarks_read   on read_watermarks;
drop policy if exists owed_write        on owed_items;
drop policy if exists facts_write       on facts;
drop policy if exists watermarks_write  on read_watermarks;
drop policy if exists watermarks_update on read_watermarks;
drop policy if exists runs_write        on runs;

-- ── authenticated-only reads ─────────────────────────────────────────
create policy org_read      on organizations   for select to authenticated using (true);
create policy runs_read     on runs            for select to authenticated using (true);
create policy rules_read    on rules           for select to authenticated using (true);
create policy settings_read on settings        for select to authenticated using (true);
create policy parties_read  on parties         for select to authenticated using (true);
create policy meanwhile_read on meanwhile_items for select to authenticated using (true);

create policy topics_read on topics for select to authenticated
  using (not private or is_paul());
create policy facts_read on facts for select to authenticated
  using (exists (select 1 from topics t where t.id = facts.topic_id and (not t.private or is_paul())));
create policy owed_read on owed_items for select to authenticated
  using (exists (select 1 from topics t where t.id = owed_items.topic_id and (not t.private or is_paul())));
create policy conflict_read on conflict_groups for select to authenticated
  using (exists (select 1 from topics t where t.id = conflict_groups.topic_id and (not t.private or is_paul())));
create policy drafts_read on drafts for select to authenticated
  using (exists (
    select 1 from owed_items oi join topics t on t.id = oi.topic_id
    where oi.id = drafts.owed_item_id and (not t.private or is_paul())));

-- Watermarks are per-reader: you read and write only your own.
create policy watermarks_read on read_watermarks for select to authenticated
  using (user_id = coalesce(auth.jwt() ->> 'email', ''));
create policy watermarks_write on read_watermarks for insert to authenticated
  with check (user_id = coalesce(auth.jwt() ->> 'email', ''));
create policy watermarks_update on read_watermarks for update to authenticated
  using (user_id = coalesce(auth.jwt() ->> 'email', ''));

-- ── authenticated-only writes (triage marks + their event-stream log) ─
create policy owed_write on owed_items for update to authenticated
  using (exists (select 1 from topics t where t.id = owed_items.topic_id and (not t.private or is_paul())))
  with check (true);
create policy facts_write on facts for insert to authenticated
  with check (exists (select 1 from topics t where t.id = facts.topic_id and (not t.private or is_paul())));
create policy runs_write on runs for insert to authenticated with check (true);

-- ── shut the anon door completely ─────────────────────────────────────
revoke all on all tables in schema public from anon;
revoke select on needs_you from anon;
revoke select on waiting_board from anon;

-- Views stay usable for signed-in sessions.
grant select on needs_you to authenticated;
grant select on waiting_board to authenticated;

-- ── migrate existing single-user watermarks to the email key ─────────
update read_watermarks set user_id = 'paul@cs-integrated.com' where user_id = 'paul';
