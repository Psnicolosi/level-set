-- S4 · Waiting board — view + seed rows.
-- HARD RULE 3: summary-only claims are barred from the waiting board at the
-- query layer (same enforcement pattern as needs_you), not UI discipline.

create view waiting_board with (security_invoker = true) as
select oi.*
from owed_items oi
left join facts f on f.id = oi.source_fact_id
where oi.direction = 'they_owe'
  and oi.state in ('open', 'blocked')
  and coalesce(f.verification, 'verified') <> 'summary_only';

grant select on waiting_board to anon, authenticated;

-- ── Seed: fill out the board (synthetic, faithful to canvas 1c) ────────
-- Facts first (every owed item cites its source — hard rule 1).
insert into facts (id, topic_id, occurred_at, body, kind, verification, sources) values
  ('f2000000-0000-0000-0000-000000000001', 'CSI-03', '2026-07-07T10:00:00-05',
   'Sent Thom the June time-entry invoice for approval.', 'fact', 'verified',
   '[{"type":"email","sender":"Katie Ekwall <katie@tbcsi.net>","timestamp":"2026-07-07T10:00:00-05:00","subject":"June time-entry invoice","external_ref":"outlook:AAMkAG-thom-0707"}]'),
  ('f2000000-0000-0000-0000-000000000002', 'PAN-01', '2026-07-20T14:00:00-05',
   'Asked Hoffman for bonus-policy wording for the employment agreements.', 'fact', 'verified',
   '[{"type":"email","sender":"Paul Nicolosi <paul@tbcsi.net>","timestamp":"2026-07-20T14:00:00-05:00","subject":"Bonus-policy wording","external_ref":"outlook:AAMkAG-bonus-0720"}]'),
  ('f2000000-0000-0000-0000-000000000003', 'PAN-01', '2026-07-20T14:05:00-05',
   'Asked Hoffman for tax-specialist input on the MSO consolidation.', 'fact', 'verified',
   '[{"type":"email","sender":"Paul Nicolosi <paul@tbcsi.net>","timestamp":"2026-07-20T14:05:00-05:00","subject":"Tax-specialist input — consolidation","external_ref":"outlook:AAMkAG-tax-0720"}]'),
  ('f2000000-0000-0000-0000-000000000004', 'CSI-02', '2026-08-04T08:00:00-05',
   'EHP''s written acceptance of the $78/hr rate is owed once the rate letter lands.', 'fact', 'verified',
   '[{"type":"meeting","attendees":["Paul Nicolosi","Ian Linnabary"],"timestamp":"2026-07-29T13:00:00-05:00","title":"Call — you, Ian Linnabary (24 min)","external_ref":"fireflies:ehp-rate-0729"}]')
on conflict (id) do nothing;

insert into owed_items (id, topic_id, direction, party_id, description, basis_date, committed_date, state, blocked_on, needs, owner, last_chased_at, chase_count, source_fact_id) values
  -- Thom · June invoice approval · Katie chases (KATIE'S filter test)
  ('d2000000-0000-0000-0000-000000000001', 'CSI-03', 'they_owe', 'b1000000-0000-0000-0000-000000000009',
   'June time-entry invoice approval.', '2026-07-07', null, 'open', null, 'none', 'katie', '2026-07-29T09:00:00-05', 1,
   'f2000000-0000-0000-0000-000000000001'),
  -- Hoffman · bonus-policy wording
  ('d2000000-0000-0000-0000-000000000002', 'PAN-01', 'they_owe', 'b1000000-0000-0000-0000-000000000001',
   'Bonus-policy wording, employment agreements.', '2026-07-20', null, 'open', null, 'none', 'paul', null, 0,
   'f2000000-0000-0000-0000-000000000002'),
  -- Hoffman · tax-specialist input
  ('d2000000-0000-0000-0000-000000000003', 'PAN-01', 'they_owe', 'b1000000-0000-0000-0000-000000000001',
   'Tax-specialist input, MSO consolidation.', '2026-07-20', null, 'open', null, 'none', 'paul', null, 0,
   'f2000000-0000-0000-0000-000000000003'),
  -- EHP · written acceptance — BLOCKED on Paul's own letter (blocked-row test)
  ('d2000000-0000-0000-0000-000000000004', 'CSI-02', 'they_owe', 'b1000000-0000-0000-0000-000000000003',
   'Written acceptance of the $78/hr rate.', '2026-08-04', null, 'blocked', 'your letter first', 'none', 'paul', null, 0,
   'f2000000-0000-0000-0000-000000000004')
on conflict (id) do nothing;
