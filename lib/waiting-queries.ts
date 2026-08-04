"use client";

import { useQuery } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { Fact, OwedItem, Party, Run, Topic } from "./types";

export interface WaitingRow extends OwedItem {
  party: Party | null;
  topic: Pick<Topic, "id" | "title" | "org_id"> | null;
  source_fact: Fact | null;
}

export interface WaitingData {
  threshold: number;
  run: Run | null;
  rows: WaitingRow[]; // sorted days desc at render; blocked rows sink
}

export function useWaitingBoard() {
  return useQuery({
    queryKey: ["waiting"],
    queryFn: async (): Promise<WaitingData> => {
      // waiting_board is the DB view enforcing hard rule 3 for this surface:
      // summary-only-sourced items never reach the board.
      const [boardQ, partiesQ, topicsQ, settingsQ, runQ] = await Promise.all([
        supabase.from("waiting_board").select("*"),
        supabase.from("parties").select("*"),
        supabase.from("topics").select("id, title, org_id"),
        supabase.from("settings").select("key, value"),
        supabase
          .from("runs")
          .select("*")
          .order("started_at", { ascending: false })
          .limit(1),
      ]);
      for (const q of [boardQ, partiesQ, topicsQ, settingsQ, runQ]) {
        if (q.error) throw q.error;
      }

      const items = (boardQ.data ?? []) as OwedItem[];
      const factIds = items.map((i) => i.source_fact_id).filter(Boolean) as string[];
      const factsQ = factIds.length
        ? await supabase.from("facts").select("*").in("id", factIds)
        : { data: [], error: null };
      if (factsQ.error) throw factsQ.error;

      const partiesById = new Map(((partiesQ.data ?? []) as Party[]).map((p) => [p.id, p]));
      const topicsById = new Map((topicsQ.data ?? []).map((t) => [t.id, t as Topic]));
      const factById = new Map(((factsQ.data ?? []) as Fact[]).map((f) => [f.id, f]));

      const rows: WaitingRow[] = items.map((i) => ({
        ...i,
        party: i.party_id ? (partiesById.get(i.party_id) ?? null) : null,
        topic: topicsById.get(i.topic_id) ?? null,
        source_fact: i.source_fact_id ? (factById.get(i.source_fact_id) ?? null) : null,
      }));

      return {
        threshold: Number(
          (settingsQ.data ?? []).find((s) => s.key === "aging_threshold_business_days")
            ?.value ?? 5,
        ),
        run: (runQ.data?.[0] as Run | undefined) ?? null,
        rows,
      };
    },
  });
}
