-- Level Set — seed fixtures. Synthetic but faithful to the design canvas
-- (Hoffman, del Castillo, EHP letter, PAN-01 conflict, Ziegler, Leap…).
-- Includes, per BUILD-ORDER definition of done: a ◐ summary-only fact,
-- an unresolved conflict, a private row, and a blocked item.
--
-- NOTE on day counts: they are computed at render time from basis dates.
-- The numbers on screen will differ from the canvas captions as real days
-- pass — that is the design ("numbers count up on their own").

begin;

-- organizations (fixed)
insert into organizations (id, name) values
  ('FAM', 'Nicolosi Family'),
  ('BVH', 'Bayview Holdings'),
  ('PAN', 'Physician''s Alliance Network'),
  ('CSI', 'CS Integrated')
on conflict (id) do nothing;

-- topics
insert into topics (id, title, org_id, status, first_seen, owner, confidence, private) values
  ('PAN-01', 'U.S. Bank facility — friendly-PC structure',        'PAN', 'active', '2026-07-16T09:00:00-05', 'paul',  0.97, false),
  ('PAN-02', 'Leap Funding — interims & sequencing',              'PAN', 'active', '2026-07-22T14:00:00-05', 'paul',  0.94, false),
  ('FAM-02', 'Dynasty Trust — del Castillo draft',                'FAM', 'active', '2026-07-18T10:00:00-05', 'paul',  0.98, false),
  ('FAM-03', 'Roth — personal insurance quotes',                  'FAM', 'active', '2026-07-27T08:00:00-05', 'katie', 0.92, false),
  ('FAM-04', 'Geneva National — tee time',                        'FAM', 'active', '2026-08-03T18:00:00-05', 'paul',  1.00, false),
  ('FAM-05', 'Bill G — personal',                                 'FAM', 'active', '2026-08-04T06:58:00-05', 'paul',  1.00, false),
  ('FAM-06', 'Estate strategy — negotiation posture',             'FAM', 'active', '2026-07-20T09:00:00-05', 'paul',  1.00, true),
  ('CSI-02', 'EHP staffing rate letter — $51 to $78/hr',          'CSI', 'active', '2026-07-29T11:00:00-05', 'paul',  0.96, false),
  ('CSI-03', 'Thom — July invoice detail',                        'CSI', 'active', '2026-08-01T09:00:00-05', 'paul',  0.95, false),
  ('CSI-05', 'Gallagher COIs',                                    'CSI', 'active', '2026-07-30T09:00:00-05', 'katie', 0.98, false),
  ('BVH-03', 'Ziegler — camera scope',                            'BVH', 'active', '2026-07-25T09:00:00-05', 'paul',  0.93, false),
  ('PAN-04', 'PryorHealth — MDJD compensation follow-up',         'PAN', 'active', '2026-07-31T09:00:00-05', 'paul',  0.81, false);

-- parties
insert into parties (id, name, org_affiliation, emails, inbound_swept_at, inbound_result) values
  ('b1000000-0000-0000-0000-000000000001', 'Bill Hoffman',      'Polsinelli',    array['whoffman@polsinelli.com'], '2026-08-04T06:02:00-05', 'silent'),
  ('b1000000-0000-0000-0000-000000000002', 'Al del Castillo',   'Estate counsel',array['adelcastillo@example.com'], '2026-08-04T06:02:00-05', 'received'),
  ('b1000000-0000-0000-0000-000000000003', 'Ian Linnabary',     'EHP',           array['ian@example.com'], null, null),
  ('b1000000-0000-0000-0000-000000000004', 'Mark Ziegler',      'Security vendor', array['mziegler@example.com'], '2026-08-04T06:02:00-05', 'silent'),
  ('b1000000-0000-0000-0000-000000000005', 'Chris D''Agostino', 'Leap Funding',  array['cdagostino@leapfunding.com'], null, null),
  ('b1000000-0000-0000-0000-000000000006', 'Doug Rogers',       'U.S. Bank',     array['drogers@usbank.com'], null, null),
  ('b1000000-0000-0000-0000-000000000007', 'Katy Roth',         null,            array['kroth@example.com'], null, null),
  ('b1000000-0000-0000-0000-000000000008', 'Bill Gerhardt',     null,            array['billg@example.com'], null, null),
  ('b1000000-0000-0000-0000-000000000009', 'Thom',              'Nicolosi PC',   array['thom@example.com'], null, null);

-- conflict group: two approval figures in circulation (UNRESOLVED)
insert into conflict_groups (id, topic_id, datum) values
  ('c1000000-0000-0000-0000-000000000001', 'PAN-01', 'U.S. Bank total approval amount');

-- facts (every one cites a source — DB rejects otherwise)
insert into facts (id, topic_id, occurred_at, body, kind, verification, sources, conflict_group) values
  -- PAN-01 conflict pair
  ('f1000000-0000-0000-0000-000000000001', 'PAN-01', '2026-07-29T12:33:00-05',
   'Total approval is $1,880,000.', 'fact', 'verified',
   '[{"type":"email","sender":"Doug Rogers <drogers@usbank.com>","timestamp":"2026-07-29T12:33:00-05:00","subject":"U.S. Bank approval — final figure","external_ref":"outlook:AAMkAG-rogers-0729"}]',
   'c1000000-0000-0000-0000-000000000001'),
  ('f1000000-0000-0000-0000-000000000002', 'PAN-01', '2026-07-29T16:41:00-05',
   'Total approval stated as $1,950,000 to Leap.', 'fact', 'verified',
   '[{"type":"email","sender":"Paul Nicolosi <paul@tbcsi.net>","timestamp":"2026-07-29T16:41:00-05:00","subject":"RE: sequencing — U.S. Bank facility","external_ref":"outlook:AAMkAG-paul-leap-0729"}]',
   'c1000000-0000-0000-0000-000000000001'),
  -- Hoffman commitment + chase
  ('f1000000-0000-0000-0000-000000000003', 'PAN-01', '2026-07-23T15:10:00-05',
   'Hoffman committed to friendly-PC and corporate documents "no later than Monday" (Jul 27).', 'fact', 'verified',
   '[{"type":"email","sender":"Bill Hoffman <whoffman@polsinelli.com>","timestamp":"2026-07-23T15:10:00-05:00","subject":"RE: friendly-PC documents","external_ref":"outlook:AAMkAG-hoffman-0723"}]',
   null),
  ('f1000000-0000-0000-0000-000000000004', 'PAN-01', '2026-07-28T09:05:00-05',
   'Chased Hoffman for the documents; no reply.', 'action', 'verified',
   '[{"type":"email","sender":"Paul Nicolosi <paul@tbcsi.net>","timestamp":"2026-07-28T09:05:00-05:00","subject":"Checking in — friendly-PC documents","external_ref":"outlook:AAMkAG-chase-0728"}]',
   null),
  ('f1000000-0000-0000-0000-000000000005', 'PAN-01', '2026-07-30T17:20:00-05',
   'Your note: Hoffman may be in trial this week.', 'fact', 'verified',
   '[{"type":"manual","sender":"Paul Nicolosi","timestamp":"2026-07-30T17:20:00-05:00","subject":"Note to ledger"}]',
   null),
  -- del Castillo draft arrival
  ('f1000000-0000-0000-0000-000000000006', 'FAM-02', '2026-08-04T05:51:00-05',
   'Revised Dynasty Trust draft received — situs change and trustee-succession fix both included.', 'fact', 'verified',
   '[{"type":"email","sender":"Al del Castillo <adelcastillo@example.com>","timestamp":"2026-08-04T05:51:00-05:00","subject":"Revised Dynasty Trust draft","external_ref":"outlook:AAMkAG-delc-0804"}]',
   null),
  -- EHP rate call
  ('f1000000-0000-0000-0000-000000000007', 'CSI-02', '2026-07-29T13:00:00-05',
   'Agreed on call: EHP staffing rate moves $51 → $78/hr effective with the August cycle; Ian expects it in writing.', 'fact', 'verified',
   '[{"type":"meeting","attendees":["Paul Nicolosi","Ian Linnabary"],"timestamp":"2026-07-29T13:00:00-05:00","title":"Call — you, Ian Linnabary (24 min)","external_ref":"fireflies:ehp-rate-0729"}]',
   null),
  -- Ziegler ask
  ('f1000000-0000-0000-0000-000000000008', 'BVH-03', '2026-07-30T10:00:00-05',
   'Asked Ziegler for the camera scope and pricing.', 'fact', 'verified',
   '[{"type":"email","sender":"Paul Nicolosi <paul@tbcsi.net>","timestamp":"2026-07-30T10:00:00-05:00","subject":"Camera scope — store coverage","external_ref":"outlook:AAMkAG-ziegler-0730"}]',
   null),
  -- Leap sequencing question
  ('f1000000-0000-0000-0000-000000000009', 'PAN-02', '2026-07-31T11:30:00-05',
   'Leap asked for the sequencing answer on interims.', 'fact', 'verified',
   '[{"type":"email","sender":"Chris D''Agostino <cdagostino@leapfunding.com>","timestamp":"2026-07-31T11:30:00-05:00","subject":"Sequencing — interims","external_ref":"outlook:AAMkAG-leap-0731"}]',
   null),
  -- ◐ SUMMARY-ONLY fact (hard-rule test: its item is barred from the pass)
  ('f1000000-0000-0000-0000-00000000000a', 'PAN-04', '2026-07-31T15:00:00-05',
   'AI meeting summary claims MDJD compensation figure was "agreed at $410k" — transcript not yet checked.', 'fact', 'summary_only',
   '[{"type":"meeting","attendees":["Paul Nicolosi","Landon Pryor"],"timestamp":"2026-07-31T15:00:00-05:00","title":"PryorHealth weekly (AI summary only)","external_ref":"fireflies:pryor-0731"}]',
   null),
  -- Meanwhile facts
  ('f1000000-0000-0000-0000-00000000000b', 'CSI-05', '2026-08-04T07:12:00-05',
   'Katie sent the Gallagher COIs.', 'action', 'verified',
   '[{"type":"email","sender":"Katie Ekwall <katie@tbcsi.net>","timestamp":"2026-08-04T07:12:00-05:00","subject":"Gallagher COIs — sent","external_ref":"outlook:AAMkAG-gallagher-0804"}]',
   null),
  ('f1000000-0000-0000-0000-00000000000c', 'FAM-03', '2026-08-04T06:40:00-05',
   'Roth''s insurance quotes landed — clock stopped, filed FAM-03.', 'fact', 'verified',
   '[{"type":"email","sender":"Katy Roth <kroth@example.com>","timestamp":"2026-08-04T06:40:00-05:00","subject":"Insurance quotes","external_ref":"outlook:AAMkAG-roth-0804"}]',
   null),
  -- Private-layer fact (RLS test: never visible to non-Paul sessions)
  ('f1000000-0000-0000-0000-00000000000d', 'FAM-06', '2026-07-20T09:30:00-05',
   'Walk-away number and fallback structure for the estate negotiation.', 'fact', 'verified',
   '[{"type":"manual","sender":"Paul Nicolosi","timestamp":"2026-07-20T09:30:00-05:00","subject":"Private note"}]',
   null),
  -- Capture facts (YOURS items)
  ('f1000000-0000-0000-0000-00000000000e', 'FAM-05', '2026-08-04T06:58:00-05',
   'Text Bill G — get on a personal call and catch up. Last touch Mar 14.', 'capture', 'verified',
   '[{"type":"manual","sender":"Paul Nicolosi (voice capture)","timestamp":"2026-08-04T06:58:00-05:00","subject":"Capture 6:58a"}]',
   null),
  ('f1000000-0000-0000-0000-00000000000f', 'CSI-03', '2026-08-01T09:15:00-05',
   'Ask Thom about the July invoice detail before approving.', 'capture', 'verified',
   '[{"type":"manual","sender":"Paul Nicolosi","timestamp":"2026-08-01T09:15:00-05:00","subject":"Capture"}]',
   null);

-- owed_items — the pass reads open, needs≠none, verified-sourced, ordered by
-- basis_date (oldest first), conflict-topics pinned above all.
insert into owed_items (id, topic_id, direction, party_id, description, refresher, basis_date, committed_date, state, blocked_on, needs, due_bucket, owner, last_chased_at, chase_count, source_fact_id) values
  -- CONFLICT resolution decision (pinned above all while unresolved)
  ('d1000000-0000-0000-0000-000000000001', 'PAN-01', 'paul_owes', null,
   'Two approval figures are in circulation from the same day — resolve which one stands.',
   'Rogers (lender of record) says $1,880,000 12:33p; you told Leap $1,950,000 4:41p. Held out of the lender brief until you resolve it.',
   '2026-07-29', null, 'open', null, 'decide', null, 'paul', null, 0,
   'f1000000-0000-0000-0000-000000000001'),
  -- 1 · Hoffman NUDGE (oldest basis)
  ('d1000000-0000-0000-0000-000000000002', 'PAN-01', 'they_owe', 'b1000000-0000-0000-0000-000000000001',
   'Hoffman — friendly-PC and corporate documents.',
   'He committed "no later than Monday" Jul 23; you chased once; he may be in trial this week (your note, Jul 30).',
   '2026-07-23', '2026-07-31', 'open', null, 'nudge', null, 'paul', '2026-07-28T09:05:00-05', 1,
   'f1000000-0000-0000-0000-000000000003'),
  -- 2 · del Castillo trust draft DECIDE
  ('d1000000-0000-0000-0000-000000000003', 'FAM-02', 'paul_owes', 'b1000000-0000-0000-0000-000000000002',
   'del Castillo''s revised Dynasty Trust draft is in.',
   'You asked for the situs change and the trustee-succession fix — both are in this draft.',
   '2026-07-24', null, 'open', null, 'decide', null, 'paul', null, 0,
   'f1000000-0000-0000-0000-000000000006'),
  -- 3 · EHP rate letter SEND (draft ready)
  ('d1000000-0000-0000-0000-000000000004', 'CSI-02', 'paul_owes', 'b1000000-0000-0000-0000-000000000003',
   'EHP rate letter, $51 → $78/hr.',
   'Ian expects it in writing; his confirmation clock starts when it lands. Katie drafted it yesterday.',
   '2026-07-29', '2026-07-29', 'open', null, 'send', null, 'paul', null, 0,
   'f1000000-0000-0000-0000-000000000007'),
  -- 4 · Ziegler NUDGE
  ('d1000000-0000-0000-0000-000000000005', 'BVH-03', 'they_owe', 'b1000000-0000-0000-0000-000000000004',
   'Ziegler — camera scope.',
   'You asked for scope and pricing Jul 30; nothing back.',
   '2026-07-30', null, 'open', null, 'nudge', null, 'paul', null, 0,
   'f1000000-0000-0000-0000-000000000008'),
  -- 5 · Leap DECIDE
  ('d1000000-0000-0000-0000-000000000006', 'PAN-02', 'paul_owes', 'b1000000-0000-0000-0000-000000000005',
   'Leap — sequencing answer due.',
   'D''Agostino asked Jul 31; interims conversation is waiting on it.',
   '2026-07-31', null, 'open', null, 'decide', null, 'paul', null, 0,
   'f1000000-0000-0000-0000-000000000009'),
  -- ◐ SUMMARY-ONLY item — must NEVER appear in the pass (hard rule 3 test)
  ('d1000000-0000-0000-0000-000000000007', 'PAN-04', 'they_owe', null,
   'Confirm MDJD compensation figure from the PryorHealth weekly.',
   null,
   '2026-07-31', null, 'open', null, 'decide', null, 'paul', null, 0,
   'f1000000-0000-0000-0000-00000000000a'),
  -- BLOCKED item — downstream of the unresolved conflict (hard rule test)
  ('d1000000-0000-0000-0000-000000000008', 'PAN-02', 'paul_owes', 'b1000000-0000-0000-0000-000000000005',
   'Lender brief to Leap — interims package.',
   null,
   '2026-07-30', null, 'blocked', 'PAN-01 conflict — approval figure unresolved', 'send', null, 'paul', null, 0,
   'f1000000-0000-0000-0000-000000000009'),
  -- PRIVATE-topic item (RLS test — invisible to non-Paul sessions)
  ('d1000000-0000-0000-0000-000000000009', 'FAM-06', 'self', null,
   'Decide the fallback structure before Thursday''s call.',
   null,
   '2026-07-20', null, 'open', null, 'decide', 'this_week', 'paul', null, 0,
   'f1000000-0000-0000-0000-00000000000d'),
  -- YOURS captures (S7 territory; seeded now for the "yours by Fri" count)
  ('d1000000-0000-0000-0000-00000000000a', 'FAM-05', 'self', 'b1000000-0000-0000-0000-000000000008',
   'Text Bill G — personal catch-up call. Last touch Mar 14.',
   null,
   '2026-08-04', null, 'open', null, 'none', 'this_week', 'paul', null, 0,
   'f1000000-0000-0000-0000-00000000000e'),
  ('d1000000-0000-0000-0000-00000000000b', 'CSI-03', 'self', 'b1000000-0000-0000-0000-000000000009',
   'Ask Thom about the July invoice detail before approving.',
   null,
   '2026-08-01', null, 'open', null, 'none', 'today', 'paul', null, 0,
   'f1000000-0000-0000-0000-00000000000f'),
  ('d1000000-0000-0000-0000-00000000000c', 'FAM-04', 'self', null,
   'Reserve tee time at Geneva National for the 15th.',
   null,
   '2026-08-03', null, 'open', null, 'none', 'weekend', 'paul', null, 0,
   null);

-- drafts (inline preview on pass cards where one exists)
insert into drafts (id, owed_item_id, channel, version, recipient, body, change_note) values
  ('e1000000-0000-0000-0000-000000000001', 'd1000000-0000-0000-0000-000000000004', 'email', 1,
   'ian@example.com',
   'Ian — confirming our conversation of July 29: effective with the August cycle, the EHP staffing rate moves from $51 to $78/hr…',
   'Katie''s draft, awaiting your OK.'),
  ('e1000000-0000-0000-0000-000000000002', 'd1000000-0000-0000-0000-000000000002', 'email', 2,
   'whoffman@polsinelli.com',
   'Bill — I need the friendly-PC and corporate documents by Thursday to hold the U.S. Bank timeline; conditions are due to the lender 3 Sep. If Thursday doesn''t work, tell me what date does and I''ll plan around it. — Paul',
   'v2: hard date + fallback instead of a status request.');

-- this morning's run (coverage strip)
insert into runs (id, started_at, kind, coverage_grade, sources, raw_count, kept_count, suppressed_count, since_summary) values
  ('a1000000-0000-0000-0000-000000000001', '2026-08-04T06:02:00-05', 'full', 'A-',
   '[{"name":"mailboxes","status":"swept","counts":{"swept":6,"total":6}},{"name":"transcripts","status":"partial","counts":{"deep":3,"total":61}}]',
   214, 41, 173,
   'Overnight was quiet. Hoffman is now past his own date — his clock below is live. del Castillo''s trust draft arrived at 5:51a — that clock stops today. Nothing new needs a decision beyond what''s in your pass.');

-- meanwhile (quiet updates)
insert into meanwhile_items (run_id, occurred_at, body, muted, topic_id, source_fact_id) values
  ('a1000000-0000-0000-0000-000000000001', '2026-08-04T07:12:00-05',
   'Katie cleared 2 of her 3 — the Gallagher COIs went out 7:12a', false, 'CSI-05', 'f1000000-0000-0000-0000-00000000000b'),
  ('a1000000-0000-0000-0000-000000000001', '2026-08-04T06:40:00-05',
   'Roth''s insurance quotes landed — clock stopped, filed FAM-03', false, 'FAM-03', 'f1000000-0000-0000-0000-00000000000c'),
  ('a1000000-0000-0000-0000-000000000001', '2026-08-04T06:02:00-05',
   '10 more topics moved, nothing needs you', true, null, null);

-- rules (seed corrections)
insert into rules (code, predicate, action, created_by, fire_count) values
  ('R-01', 'sender or subject matches PryorHealth/EHP personal matters', 'file_to FAM, never PAN', 'paul', 3),
  ('R-02', 'receipts, newsletters, automated notices', 'suppress', 'system', 129),
  ('R-03', 'mail direction', 'mirror from headers, never infer', 'system', 214),
  ('R-04', 'fact verification = summary_only', 'bar from needs-you and waiting board', 'system', 2);

commit;
