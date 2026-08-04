"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "./supabase";
import type { ConflictGroup, Fact, OwedItem, Topic } from "./types";

// Single-user alpha: the reader is Paul. Becomes the authenticated user id
// when Supabase Auth lands (pre-live-data gate).
const READER = "paul";

export interface TopicData {
  topic: Topic;
  facts: Fact[]; // newest first, inference excluded (rendered separately)
  inferences: Fact[];
  conflicts: ConflictGroup[]; // all groups on this topic, resolved or not
  openItems: OwedItem[];
  previousReadTo: string | null; // watermark position BEFORE this view
}

export function useTopicData(topicId: string) {
  return useQuery({
    queryKey: ["topic", topicId],
    queryFn: async (): Promise<TopicData> => {
      const [topicQ, factsQ, conflictsQ, itemsQ, wmQ] = await Promise.all([
        supabase.from("topics").select("*").eq("id", topicId).single(),
        supabase
          .from("facts")
          .select("*")
          .eq("topic_id", topicId)
          .order("occurred_at", { ascending: false }),
        supabase.from("conflict_groups").select("*").eq("topic_id", topicId),
        supabase
          .from("owed_items")
          .select("*")
          .eq("topic_id", topicId)
          .eq("state", "open"),
        supabase
          .from("read_watermarks")
          .select("read_to")
          .eq("user_id", READER)
          .eq("topic_id", topicId)
          .maybeSingle(),
      ]);
      if (topicQ.error) throw topicQ.error;
      if (factsQ.error) throw factsQ.error;
      if (conflictsQ.error) throw conflictsQ.error;
      if (itemsQ.error) throw itemsQ.error;
      if (wmQ.error) throw wmQ.error;

      const all = (factsQ.data ?? []) as Fact[];
      return {
        topic: topicQ.data as Topic,
        facts: all.filter((f) => f.kind !== "inference"),
        inferences: all.filter((f) => f.kind === "inference"),
        conflicts: (conflictsQ.data ?? []) as ConflictGroup[],
        openItems: (itemsQ.data ?? []) as OwedItem[],
        previousReadTo: wmQ.data?.read_to ?? null,
      };
    },
  });
}

// Watermark updates on view (S6 acceptance): called once after the stream
// renders. The PREVIOUS position stays on screen for this visit; the next
// visit sees the rule where this one ended.
export function useAdvanceWatermark(topicId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("read_watermarks")
        .upsert(
          { user_id: READER, topic_id: topicId, read_to: new Date().toISOString() },
          { onConflict: "user_id,topic_id" },
        );
      if (error) throw error;
    },
    // Deliberately no invalidation: previousReadTo must hold for this view.
    onSuccess: () => void qc,
  });
}
