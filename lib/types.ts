// Level Set domain types — mirrors supabase/migrations/0001_init.sql
// (SPEC-object-model.md). The unit of persistence is the TOPIC.

export type OrgId = "FAM" | "BVH" | "PAN" | "CSI";

export type TopicStatus = "active" | "quiet" | "closed";

export interface Topic {
  id: string; // short code e.g. PAN-01
  title: string;
  org_id: OrgId;
  status: TopicStatus;
  first_seen: string;
  last_updated: string;
  owner: string;
  confidence: number;
  private: boolean;
}

export type FactKind = "fact" | "inference" | "action" | "capture";
export type Verification = "verified" | "summary_only";

export interface FactSource {
  type: "email" | "meeting" | "manual";
  sender?: string;
  attendees?: string[];
  timestamp: string;
  subject?: string;
  title?: string;
  external_ref?: string;
}

export interface Fact {
  id: string;
  topic_id: string;
  occurred_at: string;
  body: string;
  kind: FactKind;
  verification: Verification;
  sources: FactSource[];
  conflict_group: string | null;
}

export type Direction = "they_owe" | "paul_owes" | "self";
export type ItemState = "open" | "blocked" | "done";
export type Needs = "decide" | "nudge" | "send" | "none";
export type DueBucket = "today" | "few_days" | "this_week" | "weekend";

export interface OwedItem {
  id: string;
  topic_id: string;
  direction: Direction;
  party_id: string | null;
  description: string;
  refresher: string | null; // memory-jogger line (prior commitments, own notes) — written by ingestion
  basis_date: string; // date the clock starts — from source, IMMUTABLE. Days waiting is ALWAYS computed.
  committed_date: string | null;
  state: ItemState;
  blocked_on: string | null;
  needs: Needs;
  due_bucket: DueBucket | null;
  owner: string;
  last_chased_at: string | null;
  chase_count: number;
  deferred_at: string | null; // "Later" mark — persists across reloads
  source_fact_id: string | null;
}

export interface Party {
  id: string;
  name: string;
  org_affiliation: string | null;
  emails: string[];
  inbound_swept_at: string | null;
  inbound_result: string | null;
}

export interface RunSource {
  name: string;
  status: "swept" | "failed" | "partial";
  counts?: Record<string, number>;
  note?: string;
}

export interface Run {
  id: string;
  started_at: string;
  kind: "full" | "incremental" | "manual";
  coverage_grade: string; // A–F (with modifiers e.g. "A-", "B")
  sources: RunSource[];
  raw_count: number;
  kept_count: number;
  suppressed_count: number;
  since_summary: string | null; // run-generated narrative; live clocks stay computed
}

export interface ConflictGroup {
  id: string;
  topic_id: string;
  resolved_at: string | null;
  winner_fact_id: string | null;
}

export interface Rule {
  id: string;
  code: string;
  predicate: string;
  action: string;
  created_by: "paul" | "katie" | "system";
  fire_count: number;
}

export interface Setting {
  key: string;
  value: unknown;
}

// ── Joined shapes used by the Home screen ──────────────────────────────

export interface PassItem extends OwedItem {
  topic: Pick<Topic, "id" | "title" | "org_id" | "private">;
  source_fact: Fact | null;
  draft_preview: string | null;
  has_conflict: boolean; // unresolved conflict group on the topic — pinned above all
}
