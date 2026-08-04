// /api/ingest — the harvester's write path.
//
// The scheduled sweep agent POSTs a run envelope here; this route writes it
// into Supabase with the service-role key (server-side only, never shipped
// to the browser). Guarded by a bearer secret. The sandbox the harvester
// runs in cannot reach Supabase directly, but it CAN reach this app — that
// is the whole reason this route exists.
//
// Hard rules enforced on the way in:
//   - facts without sources are rejected here AND by the DB constraint
//   - owed items keyed by external_key: re-runs update, never duplicate,
//     and basis_date changes on existing items are refused (rule 6)
//   - topics' private flag is never clobbered by the harvester (rule 5)

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createHash } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IngestTopic {
  id: string;
  title: string;
  org_id: string;
  status?: string;
  first_seen: string;
  owner?: string;
  confidence?: number;
  private_candidate?: boolean; // flagged for Paul's review — never auto-private
}

interface IngestParty {
  name: string;
  primary_email: string;
  org_affiliation?: string;
  emails?: string[];
  inbound_swept_at?: string;
  inbound_result?: string;
}

interface IngestFact {
  topic_id: string;
  occurred_at: string;
  body: string;
  kind?: string;
  verification?: string;
  sources: unknown[];
  conflict_datum?: string; // same datum + different values ⇒ shared group
}

interface IngestOwedItem {
  external_key: string;
  topic_id: string;
  direction: string;
  party_email?: string;
  description: string;
  refresher?: string;
  basis_date: string;
  committed_date?: string;
  state?: string;
  blocked_on?: string;
  needs?: string;
  due_bucket?: string;
  owner?: string;
  last_chased_at?: string;
  chase_count?: number;
  // Provenance: the fact this item derives from, matched by content key so
  // the card keeps its working source link (hard rule 1 on the surface).
  source_fact?: { topic_id: string; occurred_at: string; body: string };
}

interface IngestEnvelope {
  action?: "ingest" | "wipe_fixtures";
  confirm?: string;
  run?: {
    started_at?: string;
    kind: string;
    coverage_grade: string;
    sources: unknown[];
    raw_count?: number;
    kept_count?: number;
    suppressed_count?: number;
    since_summary?: string | null;
  };
  topics?: IngestTopic[];
  parties?: IngestParty[];
  facts?: IngestFact[];
  owed_items?: IngestOwedItem[];
  meanwhile?: { body: string; muted?: boolean; topic_id?: string }[];
}

function authorized(req: Request): boolean {
  const secret = process.env.INGEST_SECRET;
  if (!secret) return false;
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (token.length !== secret.length) return false;
  let diff = 0;
  for (let i = 0; i < token.length; i++) diff |= token.charCodeAt(i) ^ secret.charCodeAt(i);
  return diff === 0;
}

function serviceClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const factKey = (f: IngestFact) =>
  createHash("sha256").update(`${f.topic_id}|${f.occurred_at}|${f.body}`).digest("hex");

export async function POST(req: Request) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = serviceClient();
  if (!db) {
    return NextResponse.json(
      { error: "server missing SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL" },
      { status: 500 },
    );
  }

  let body: IngestEnvelope;
  try {
    body = (await req.json()) as IngestEnvelope;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // ── Fixture wipe (one-time, before the first real harvest) ───────────
  if (body.action === "wipe_fixtures") {
    if (body.confirm !== "WIPE FIXTURES") {
      return NextResponse.json({ error: 'confirm must be "WIPE FIXTURES"' }, { status: 400 });
    }
    // Dependency order; each table names its key column (PostgREST requires
    // a filter on delete). Organizations, settings, and rules survive.
    const WIPE: [string, string][] = [
      ["meanwhile_items", "id"],
      ["drafts", "id"],
      ["read_watermarks", "user_id"],
      ["owed_items", "id"],
      ["facts", "id"],
      ["conflict_groups", "id"],
      ["runs", "id"],
      ["topics", "id"],
      ["parties", "id"],
    ];
    for (const [table, key] of WIPE) {
      const { error } = await db.from(table).delete().not(key, "is", null);
      if (error) return NextResponse.json({ error: `wipe ${table}: ${error.message}` }, { status: 500 });
    }
    return NextResponse.json({ ok: true, wiped: true });
  }

  const report: Record<string, unknown> = {};
  const errors: string[] = [];

  // ── Topics: upsert, never clobbering the private flag ────────────────
  if (body.topics?.length) {
    let upserted = 0;
    for (const t of body.topics) {
      const { data: existing } = await db.from("topics").select("id, private").eq("id", t.id).maybeSingle();
      const row = {
        id: t.id,
        title: t.title,
        org_id: t.org_id,
        status: t.status ?? "active",
        first_seen: existing ? undefined : t.first_seen,
        last_updated: new Date().toISOString(),
        owner: t.owner ?? "paul",
        confidence: t.confidence ?? 1,
        // private stays whatever Paul set; new topics are never auto-private
        private: existing ? undefined : false,
      };
      const clean = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
      const { error } = existing
        ? await db.from("topics").update(clean).eq("id", t.id)
        : await db.from("topics").insert(clean);
      if (error) errors.push(`topic ${t.id}: ${error.message}`);
      else upserted++;
    }
    report.topics = upserted;
  }

  // ── Parties: upsert by primary email ─────────────────────────────────
  const partyIdByEmail = new Map<string, string>();
  {
    const { data: allParties } = await db.from("parties").select("id, primary_email, emails");
    for (const p of allParties ?? []) {
      if (p.primary_email) partyIdByEmail.set(p.primary_email.toLowerCase(), p.id);
      for (const e of p.emails ?? []) partyIdByEmail.set(String(e).toLowerCase(), p.id);
    }
  }
  if (body.parties?.length) {
    let upserted = 0;
    for (const p of body.parties) {
      const key = p.primary_email.toLowerCase();
      const existingId = partyIdByEmail.get(key);
      const row = {
        name: p.name,
        primary_email: p.primary_email,
        org_affiliation: p.org_affiliation ?? null,
        emails: p.emails ?? [p.primary_email],
        inbound_swept_at: p.inbound_swept_at ?? null,
        inbound_result: p.inbound_result ?? null,
      };
      if (existingId) {
        const { error } = await db.from("parties").update(row).eq("id", existingId);
        if (error) errors.push(`party ${key}: ${error.message}`);
        else upserted++;
      } else {
        const { data, error } = await db.from("parties").insert(row).select("id").single();
        if (error) errors.push(`party ${key}: ${error.message}`);
        else {
          partyIdByEmail.set(key, data.id);
          upserted++;
        }
      }
    }
    report.parties = upserted;
  }

  // ── Facts: idempotent by content key; conflict grouping by datum ─────
  if (body.facts?.length) {
    let inserted = 0;
    let skipped = 0;
    for (const f of body.facts) {
      if (!Array.isArray(f.sources) || f.sources.length === 0) {
        errors.push(`fact "${f.body.slice(0, 40)}": no source — rejected (hard rule 1)`);
        continue;
      }
      let conflictGroup: string | null = null;
      if (f.conflict_datum) {
        const { data: g } = await db
          .from("conflict_groups")
          .select("id")
          .eq("topic_id", f.topic_id)
          .eq("datum", f.conflict_datum)
          .is("resolved_at", null)
          .maybeSingle();
        if (g) conflictGroup = g.id;
        else {
          const { data: ng, error } = await db
            .from("conflict_groups")
            .insert({ topic_id: f.topic_id, datum: f.conflict_datum })
            .select("id")
            .single();
          if (error) {
            errors.push(`conflict group ${f.conflict_datum}: ${error.message}`);
            continue;
          }
          conflictGroup = ng.id;
        }
      }
      const { error } = await db.from("facts").insert({
        topic_id: f.topic_id,
        occurred_at: f.occurred_at,
        body: f.body,
        kind: f.kind ?? "fact",
        verification: f.verification ?? "verified",
        sources: f.sources,
        conflict_group: conflictGroup,
        content_key: factKey(f),
      });
      if (error) {
        if (error.message.includes("facts_content_key")) skipped++;
        else errors.push(`fact "${f.body.slice(0, 40)}": ${error.message}`);
      } else inserted++;
    }
    report.facts = { inserted, duplicates_skipped: skipped };
  }

  // ── Owed items: upsert by external_key; basis dates immutable ────────
  if (body.owed_items?.length) {
    let inserted = 0;
    let updated = 0;
    for (const o of body.owed_items) {
      const partyId = o.party_email ? (partyIdByEmail.get(o.party_email.toLowerCase()) ?? null) : null;
      let sourceFactId: string | null = null;
      if (o.source_fact) {
        const key = factKey(o.source_fact as IngestFact);
        const { data: sf } = await db.from("facts").select("id").eq("content_key", key).maybeSingle();
        sourceFactId = sf?.id ?? null;
      }
      const { data: existing } = await db
        .from("owed_items")
        .select("id, basis_date")
        .eq("external_key", o.external_key)
        .maybeSingle();
      if (existing) {
        // basis_date never moves; the DB trigger backs this up.
        const row = {
          description: o.description,
          refresher: o.refresher ?? null,
          committed_date: o.committed_date ?? null,
          state: o.state ?? "open",
          blocked_on: o.blocked_on ?? null,
          needs: o.needs ?? "none",
          due_bucket: o.due_bucket ?? null,
          owner: o.owner ?? "paul",
          last_chased_at: o.last_chased_at ?? null,
          chase_count: o.chase_count ?? 0,
          party_id: partyId,
          ...(sourceFactId ? { source_fact_id: sourceFactId } : {}),
        };
        const { error } = await db.from("owed_items").update(row).eq("id", existing.id);
        if (error) errors.push(`owed ${o.external_key}: ${error.message}`);
        else updated++;
      } else {
        const { error } = await db.from("owed_items").insert({
          external_key: o.external_key,
          topic_id: o.topic_id,
          direction: o.direction,
          party_id: partyId,
          description: o.description,
          refresher: o.refresher ?? null,
          basis_date: o.basis_date,
          committed_date: o.committed_date ?? null,
          state: o.state ?? "open",
          blocked_on: o.blocked_on ?? null,
          needs: o.needs ?? "none",
          due_bucket: o.due_bucket ?? null,
          owner: o.owner ?? "paul",
          last_chased_at: o.last_chased_at ?? null,
          chase_count: o.chase_count ?? 0,
          source_fact_id: sourceFactId,
        });
        if (error) errors.push(`owed ${o.external_key}: ${error.message}`);
        else inserted++;
      }
    }
    report.owed_items = { inserted, updated };
  }

  // ── Run record + meanwhile (current-run scoped) ───────────────────────
  if (body.run) {
    const { data: run, error } = await db
      .from("runs")
      .insert({
        started_at: body.run.started_at ?? new Date().toISOString(),
        kind: body.run.kind,
        coverage_grade: body.run.coverage_grade,
        sources: body.run.sources,
        raw_count: body.run.raw_count ?? 0,
        kept_count: body.run.kept_count ?? 0,
        suppressed_count: body.run.suppressed_count ?? 0,
        since_summary: body.run.since_summary ?? null,
      })
      .select("id")
      .single();
    if (error) errors.push(`run: ${error.message}`);
    else {
      report.run_id = run.id;
      // Meanwhile shows the CURRENT run's quiet updates only.
      await db.from("meanwhile_items").delete().not("id", "is", null);
      if (body.meanwhile?.length) {
        const { error: mwError } = await db.from("meanwhile_items").insert(
          body.meanwhile.map((m) => ({
            run_id: run.id,
            occurred_at: new Date().toISOString(),
            body: m.body,
            muted: m.muted ?? false,
            topic_id: m.topic_id ?? null,
          })),
        );
        if (mwError) errors.push(`meanwhile: ${mwError.message}`);
        else report.meanwhile = body.meanwhile.length;
      }
    }
  }

  return NextResponse.json({ ok: errors.length === 0, report, errors }, { status: errors.length ? 207 : 200 });
}
