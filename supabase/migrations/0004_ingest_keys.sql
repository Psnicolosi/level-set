-- 0004 · Ingest keys — stable identity for harvester writes.
-- The harvester keys every owed item to a stable external_key so a re-run
-- UPDATES the same clock instead of duplicating it (day counts survive
-- everything — hard rule 6 — which requires the row itself to survive).

alter table owed_items add column if not exists external_key text unique;

-- Facts carry a content hash for idempotent re-runs (same fact swept twice
-- lands once).
alter table facts add column if not exists content_key text;
create unique index if not exists facts_content_key on facts (content_key) where content_key is not null;

-- Parties get a primary-email key for upserts.
alter table parties add column if not exists primary_email text unique;
update parties set primary_email = emails[1] where primary_email is null and array_length(emails, 1) >= 1;
