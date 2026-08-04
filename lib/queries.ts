"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type {
  ConflictGroup,
  Fact,
  OwedItem,
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
  passItems: PassItem[]; // conflicts pinned above all, then strictly oldest basis_date first
  agingCount: number;
  yoursByFriCount: number;
  conflictCount: number;
  meanwhile: MeanwhileRow[];
}

const HOME_KEY = ["home"];

async function fetchHome(): Promise<HomeData> {
  const [settingsQ, runQ, needsQ, itemsQ, topicsQ, conflictsQ, meanwhileQ] =
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
    ]);

  for (const q of [settingsQ, runQ, needsQ, itemsQ, topicsQ, conflictsQ, meanwhileQ]) {
    if (q.error) throw q.error;
  }

  const threshold = Number(
    (settingsQ.data ?? []).find((s) => s.key === "aging_threshold_business_days")
      ?.value ?? 5,
  );
  const run = (runQ.data?.[0] as Run | undefined) ?? null;
  const needs = (needsQ.data ?? []) as OwedItem[];
  const allItems = (itemsQ.data ?? []) as OwedItem[];
  const topics = new Map((topicsQ.data ?? []).map((t) => [t.id, t as Topic]));
  const openConflicts = (conflictsQ.data ?? []) as ConflictGroup[];
  const conflictTopicIds = new Set(openConflicts.map((c) => c.topic_id));

  // Secondary fetches: source facts + drafts for the pass items.
  const factIds = needs.map((i) => i.source_fact_id).filter(Boolean) as string[];
  const itemIds = needs.map((i) => i.id);
  const [factsQ, draftsQ] = await Promise.all([
    factIds.length
      ? supabase.from("facts").select("*").in("id", factIds)
      : Promise.resolve({ data: [], error: null }),
    itemIds.length
      ? supabase.from("drafts").select("owed_item_id, body").in("owed_item_id", itemIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (factsQ.error) throw factsQ.error;
  if (draftsQ.error) throw draftsQ.error;

  const factById = new Map(((factsQ.data ?? []) as Fact[]).map((f) => [f.id, f]));
  const draftByItem = new Map(
    ((draftsQ.data ?? []) as { owed_item_id: string; body: string }[]).map((d) => [
      d.owed_item_id,
      d.body,
    ]),
  );

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
      (i.needs === "none" ? true : needsIds.has(i.id)) && // non-needs items are fine; needs-items must have passed the view filter
      businessDaysSince(i.basis_date) > threshold,
  ).length;

  const yoursByFriCount = allItems.filter(
    (i) =>
      i.state === "open" &&
      i.direction === "self" &&
      (i.due_bucket === "today" || i.due_bucket === "few_days" || i.due_bucket === "this_week"),
  ).length;

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
  };
}

export function useHomeData() {
  return useQuery({ queryKey: HOME_KEY, queryFn: fetchHome });
}

// ── Triage marks — logged to the topic's event stream the moment taken ──

type Mark = "done" | "later";

async function markItem(item: PassItem, mark: Mark) {
  const now = new Date().toISOString();
  const update =
    mark === "done" ? { state: "done" as const } : { deferred_at: now };

  const { error: updateError } = await supabase
    .from("owed_items")
    .update(update)
    .eq("id", item.id);
  if (updateError) throw updateError;

  // Event-stream log (kind=action, manual source — hard rule 1 still applies).
  const { error: factError } = await supabase.from("facts").insert({
    topic_id: item.topic_id,
    occurred_at: now,
    body:
      mark === "done"
        ? `Marked done from the morning pass — ${item.description}`
        : `Deferred (Later) from the morning pass — ${item.description}`,
    kind: "action",
    verification: "verified",
    sources: [{ type: "manual", sender: "Paul Nicolosi", timestamp: now, subject: "Pass action" }],
  });
  if (factError) throw factError;
}

export function useMarkItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ item, mark }: { item: PassItem; mark: Mark }) => markItem(item, mark),
    // Optimistic: the pass advances immediately; server confirms behind it.
    onMutate: async ({ item, mark }) => {
      await qc.cancelQueries({ queryKey: HOME_KEY });
      const prev = qc.getQueryData<HomeData>(HOME_KEY);
      if (prev) {
        qc.setQueryData<HomeData>(HOME_KEY, {
          ...prev,
          passItems:
            mark === "done"
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
