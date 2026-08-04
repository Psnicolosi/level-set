"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type {
  ConflictGroup,
  Fact,
  OwedItem,
  Party,
  PassItem,
  Run,
  Topic,
} from "./types";

export interface MeanwhileRow {
  id: string;
  occurred_at: string;
  body: string;
  muted: boolean;
  topic_id: string | null;
  source_fact_id: string | null;
  source_fact?: Fact | null;
}

export interface HomeData {
  threshold: number; // t, business days (setting, default 5)
  run: Run | null;
  passItems: PassItem[]; // Paul's queue: conflicts pinned, then strictly oldest basis_date first
  agingCount: number;
  yoursByFriCount: number;
  conflictCount: number;
  meanwhile: MeanwhileRow[];
  partiesById: Map<string, Party>;
  conflictFactsByGroup: Map<string, Fact[]>; // unresolved groups → their competing facts
  blockedItems: OwedItem[]; // downstream items held by unresolved conflicts
}

const HOME_KEY = ["home"];

async function fetchHome(): Promise<HomeData> {
  const [settingsQ, runQ, needsQ, itemsQ, topicsQ, conflictsQ, meanwhileQ, partiesQ] =
    await Promise.all([
      supabase.from("settings").select("key, value"),
      supabase
        .from("runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1),
      // needs_you is the DB view that enforces hard rule 3: summary-only
      // sourced items never reach the pass. Not a client-side filter.
      supabase.from("needs_you").select("*"),
      supabase.from("owed_items").select("*"),
      supabase.from("topics").select("id, title, org_id, private"),
      supabase.from("conflict_groups").select("*").is("resolved_at", null),
      supabase
        .from("meanwhile_items")
        .select("*")
        .order("muted", { ascending: true })
        .order("occurred_at", { ascending: false }),
      supabase.from("parties").select("*"),
    ]);

  for (const q of [settingsQ, runQ, needsQ, itemsQ, topicsQ, conflictsQ, meanwhileQ, partiesQ]) {
    if (q.error) throw q.error;
  }

  const threshold = Number(
    (settingsQ.data ?? []).find((s) => s.key === "aging_threshold_business_days")
      ?.value ?? 5,
  );
  const run = (runQ.data?.[0] as Run | undefined) ?? null;
  const needs = ((needsQ.data ?? []) as OwedItem[]).filter((i) => i.owner === "paul");
  const allItems = (itemsQ.data ?? []) as OwedItem[];
  const topics = new Map((topicsQ.data ?? []).map((t) => [t.id, t as Topic]));
  const openConflicts = (conflictsQ.data ?? []) as ConflictGroup[];
  const partiesById = new Map(((partiesQ.data ?? []) as Party[]).map((p) => [p.id, p]));

  // Secondary fetches: source facts + drafts for the pass items, and the
  // competing facts inside each unresolved conflict group.
  const factIds = needs.map((i) => i.source_fact_id).filter(Boolean) as string[];
  const itemIds = needs.map((i) => i.id);
  const groupIds = openConflicts.map((c) => c.id);
  const [factsQ, draftsQ, conflictFactsQ] = await Promise.all([
    factIds.length
      ? supabase.from("facts").select("*").in("id", factIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabase.from("drafts").select("owed_item_id, body").in("owed_item_id", itemIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase.from("facts").select("*").in("conflict_group", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (factsQ.error) throw factsQ.error;
  if (draftsQ.error) throw draftsQ.error;
  if (conflictFactsQ.error) throw conflictFactsQ.error;

  const factById = new Map(((factsQ.data ?? []) as Fact[]).map((f) => [f.id, f]));
  const draftByItem = new Map(
    ((draftsQ.data ?? []) as { owed_item_id: string; body: string }[]).map((d) => [
      d.owed_item_id,
      d.body,
    ]),
  );
  const conflictFactsByGroup = new Map<string, Fact[]>();
  for (const f of (conflictFactsQ.data ?? []) as Fact[]) {
    if (!f.conflict_group) continue;
    const list = conflictFactsByGroup.get(f.conflict_group) ?? [];
    list.push(f);
    conflictFactsByGroup.set(f.conflict_group, list);
  }

  const unresolvedGroupIds = new Set(openConflicts.map((c) => c.id));

  const passItems: PassItem[] = needs
    .map((i) => {
      const fact = i.source_fact_id ? (factById.get(i.source_fact_id) ?? null) : null;
      const topic = topics.get(i.topic_id);
      return {
        ...i,
        topic: topic ?? { id: i.topic_id, title: i.topic_id, org_id: "CSI" as const, private: false },
        source_fact: fact,
        draft_preview: draftByItem.get(i.id) ?? null,
        // Pinned only when the item itself carries the contested fact —
        // not every item on a topic that has a conflict somewhere.
        has_conflict: Boolean(fact?.conflict_group && unresolvedGroupIds.has(fact.conflict_group)),
      };
    })
    // Conflicts pinned above all; then STRICTLY oldest basis_date first.
    .sort((a, b) => {
      if (a.has_conflict !== b.has_conflict) return a.has_conflict ? -1 : 1;
      return a.basis_date.localeCompare(b.basis_date);
    });

  // Aging tile: open items past threshold t (business days), excluding
  // blocked (blocked rows show their blocker, not an age) and excluding
  // summary-only-sourced items (they are barred from attention surfaces).
  const needsIds = new Set(needs.map((n) => n.id));
  const { businessDaysSince } = await import("./compute");
  const agingCount = allItems.filter(
    (i) =>
      i.state === "open" &&
      (i.needs === "none" ? true : needsIds.has(i.id)) &&
      businessDaysSince(i.basis_date) > threshold,
  ).length;

  const yoursByFriCount = allItems.filter(
    (i) =>
      i.state === "open" &&
      i.direction === "self" &&
      (i.due_bucket === "today" || i.due_bucket === "few_days" || i.due_bucket === "this_week"),
  ).length;

  const blockedItems = allItems.filter((i) => i.state === "blocked");

  const meanwhileFacts = (meanwhileQ.data ?? []) as MeanwhileRow[];
  const mwFactIds = meanwhileFacts.map((m) => m.source_fact_id).filter(Boolean) as string[];
  let mwFactById = new Map<string, Fact>();
  if (mwFactIds.length) {
    const { data, error } = await supabase.from("facts").select("*").in("id", mwFactIds);
    if (error) throw error;
    mwFactById = new Map((data as Fact[]).map((f) => [f.id, f]));
  }
  const meanwhile = meanwhileFacts.map((m) => ({
    ...m,
    source_fact: m.source_fact_id ? (mwFactById.get(m.source_fact_id) ?? null) : null,
  }));

  return {
    threshold,
    run,
    passItems,
    agingCount,
    yoursByFriCount,
    conflictCount: openConflicts.length,
    meanwhile,
    partiesById,
    conflictFactsByGroup,
    blockedItems,
  };
}

export function useHomeData() {
  return useQuery({ queryKey: HOME_KEY, queryFn: fetchHome });
}

// ── Triage marks — logged to the topic's event stream the moment taken ──

export type Mark = "done" | "later" | "snooze" | "katie";

const MARK_BODY: Record<Mark, (d: string) => string> = {
  done: (d) => `Marked done — ${d}`,
  later: (d) => `Deferred (Later) from the morning pass — ${d}`,
  snooze: (d) => `Snoozed from Needs-You — ${d}`,
  katie: (d) => `Delegated to Katie — ${d}`,
};

async function markItem(item: PassItem, mark: Mark) {
  const now = new Date().toISOString();
  const update =
    mark === "done"
      ? { state: "done" as const }
      : mark === "katie"
        ? { owner: "katie" }
        : { deferred_at: now };

  const { error: updateError } = await supabase
    .from("owed_items")
    .update(update)
    .eq("id", item.id);
  if (updateError) throw updateError;

  // Event-stream log (kind=action, manual source — hard rule 1 still applies).
  const { error: factError } = await supabase.from("facts").insert({
    topic_id: item.topic_id,
    occurred_at: now,
    body: MARK_BODY[mark](item.description),
    kind: "action",
    verification: "verified",
    sources: [{ type: "manual", sender: "Paul Nicolosi", timestamp: now, subject: "Triage mark" }],
  });
  if (factError) throw factError;
}

export function useMarkItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, mark }: { item: PassItem; mark: Mark }) => markItem(item, mark),
    // Optimistic: the surface advances immediately; server confirms behind it.
    onMutate: async ({ item, mark }) => {
      await qc.cancelQueries({ queryKey: HOME_KEY });
      const prev = qc.getQueryData<HomeData>(HOME_KEY);
      if (prev) {
        qc.setQueryData<HomeData>(HOME_KEY, {
          ...prev,
          passItems:
            mark === "done" || mark === "katie"
              ? prev.passItems.filter((p) => p.id !== item.id)
              : prev.passItems.map((p) =>
                  p.id === item.id ? { ...p, deferred_at: new Date().toISOString() } : p,
                ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(HOME_KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: HOME_KEY }),
  });
}
