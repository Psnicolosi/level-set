"use client";

// S6 · TOPIC TIMELINE (canvas 1d).
// Header: back link, topic code + first-seen + owner, serif title, status
// chips. Stream newest-first: glyph column (● ◐ ▲ ✓) + mono date/
// verification label + body + source links. Facts sharing an unresolved
// conflict group collapse into one red ▲ entry showing both values.
// READ-TO-HERE watermark: dashed rule at the reader's last position;
// entries below it render ink-secondary (absorbed). INFERENCE card at the
// bottom — labelled, never mixed with facts.

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Fact, FactSource } from "@/lib/types";
import { useAdvanceWatermark, useTopicData } from "@/lib/topic-queries";
import ProvenanceSheet, { sourceLabel } from "@/components/ProvenanceSheet";

function monthDay(iso: string): string {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-GB", { month: "short" }).toUpperCase()} ${d.getDate()}`;
}

function contestedValue(f: Fact): string {
  const m = f.body.match(/\$[\d][\d,]*(?:\.\d+)?\s?[MK]?/);
  return m ? m[0] : f.body;
}

type Entry =
  | { type: "fact"; fact: Fact; at: string }
  | { type: "conflict"; facts: Fact[]; groupId: string; resolved: boolean; at: string };

export default function TopicTimeline({ topicId }: { topicId: string }) {
  const { data, isLoading, error } = useTopicData(topicId);
  const advance = useAdvanceWatermark(topicId);
  const advanced = useRef(false);
  const [sheetSources, setSheetSources] = useState<FactSource[] | null>(null);

  // Watermark updates on view — once, after data arrives.
  useEffect(() => {
    if (data && !advanced.current) {
      advanced.current = true;
      advance.mutate();
    }
  }, [data, advance]);

  const entries = useMemo<Entry[]>(() => {
    if (!data) return [];
    const resolvedByGroup = new Map(data.conflicts.map((c) => [c.id, Boolean(c.resolved_at)]));
    const grouped = new Map<string, Fact[]>();
    const singles: Fact[] = [];
    for (const f of data.facts) {
      if (f.conflict_group && resolvedByGroup.has(f.conflict_group)) {
        const list = grouped.get(f.conflict_group) ?? [];
        list.push(f);
        grouped.set(f.conflict_group, list);
      } else {
        singles.push(f);
      }
    }
    const out: Entry[] = singles.map((f) => ({ type: "fact", fact: f, at: f.occurred_at }));
    for (const [groupId, facts] of grouped) {
      out.push({
        type: "conflict",
        facts: facts.slice().sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
        groupId,
        resolved: resolvedByGroup.get(groupId) ?? false,
        at: facts.reduce((m, f) => (f.occurred_at > m ? f.occurred_at : m), facts[0].occurred_at),
      });
    }
    return out.sort((a, b) => b.at.localeCompare(a.at)); // newest first
  }, [data]);

  if (isLoading) {
    return (
      <div className="pt-[40px] text-center font-mono text-[11px] text-ink-muted">
        LOADING TOPIC…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mt-[40px] border border-dashed border-amber px-[12px] py-[11px]">
        <div className="font-mono text-[10px] tracking-[1px] text-amber-text">
          TOPIC UNREACHABLE
        </div>
        <div className="mt-[6px] text-[13px] text-ink-body">
          {error instanceof Error ? error.message : `No topic ${topicId} visible to this session.`}
        </div>
      </div>
    );
  }

  const { topic, previousReadTo } = data;
  const firstSeen = new Date(topic.first_seen);

  // Earliest future committed date among open items → deadline chip.
  const nextDue = data.openItems
    .map((i) => i.committed_date)
    .filter((d): d is string => Boolean(d) && (d as string) >= new Date().toISOString().slice(0, 10))
    .sort()[0];

  // Watermark rule sits between entries newer and older than previousReadTo.
  const wmIndex = previousReadTo ? entries.findIndex((e) => e.at <= previousReadTo) : -1;

  return (
    <div className="flex flex-1 flex-col gap-[12px]">
      <div className="flex items-center justify-between font-mono text-[11px] text-ink-muted">
        <Link href="/" className="min-h-[44px] flex items-center text-ink-muted">
          ‹ TODAY
        </Link>
        <span>
          {topic.id} · first seen{" "}
          {firstSeen.toLocaleDateString("en-GB", { month: "short", day: "numeric" })} · owner:{" "}
          {topic.owner === "paul" ? "you" : topic.owner}
        </span>
      </div>

      <h1 className="font-serif text-[24px] font-semibold leading-[1.2]">{topic.title}</h1>

      <div className="flex flex-wrap gap-[8px] font-mono text-[11px]">
        <span
          className={`border px-[8px] py-[2px] ${
            topic.status === "closed"
              ? "border-green text-green-text"
              : topic.status === "quiet"
                ? "border-line-strong text-ink-muted"
                : "border-line-strong"
          }`}
        >
          {topic.status.toUpperCase()}
        </span>
        {nextDue && (
          <span className="border border-amber px-[8px] py-[2px] text-amber-text">
            due{" "}
            {new Date(`${nextDue}T00:00:00`).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
            })}{" "}
            — {dueInDays(nextDue)}d
          </span>
        )}
      </div>

      {/* Stream, newest first */}
      <div className="flex flex-col">
        {entries.map((e, i) => (
          <div key={e.type === "fact" ? e.fact.id : e.groupId}>
            {i === wmIndex && previousReadTo && <WatermarkRule readTo={previousReadTo} />}
            {e.type === "conflict" ? (
              <ConflictEntry entry={e} onShowSources={setSheetSources} absorbed={isAbsorbed(e.at, previousReadTo)} />
            ) : (
              <FactEntry fact={e.fact} onShowSources={setSheetSources} absorbed={isAbsorbed(e.at, previousReadTo)} />
            )}
          </div>
        ))}
      </div>

      {/* INFERENCE — labelled, never mixed with fact */}
      {data.inferences.map((inf) => (
        <div
          key={inf.id}
          className="border border-line bg-paper-raised px-[12px] py-[9px] text-[12px] leading-[1.45] text-ink-secondary"
        >
          <span className="font-mono text-[10px] tracking-[1px]">INFERENCE</span> — labelled,
          never mixed with fact: {inf.body}
        </div>
      ))}

      {sheetSources && (
        <ProvenanceSheet sources={sheetSources} onClose={() => setSheetSources(null)} />
      )}
    </div>
  );
}

function dueInDays(date: string): number {
  const due = new Date(`${date}T00:00:00`).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((due - today.getTime()) / 86_400_000));
}

function isAbsorbed(at: string, readTo: string | null): boolean {
  return Boolean(readTo && at <= readTo);
}

function WatermarkRule({ readTo }: { readTo: string }) {
  const d = new Date(readTo);
  const label = `READ TO HERE · ${monthDay(readTo)}, ${d
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()
    .replace(" am", "a")
    .replace(" pm", "p")}`;
  return (
    <div className="flex items-center gap-[8px] py-[7px]">
      <span className="flex-1 border-t border-dashed border-[#A8A294]" />
      <span className="font-mono text-[10px] text-ink-muted">{label}</span>
      <span className="flex-1 border-t border-dashed border-[#A8A294]" />
    </div>
  );
}

function FactEntry({
  fact,
  onShowSources,
  absorbed,
}: {
  fact: Fact;
  onShowSources: (s: FactSource[]) => void;
  absorbed: boolean;
}) {
  const summaryOnly = fact.verification === "summary_only";
  const action = fact.kind === "action";
  const glyph = summaryOnly ? "◐" : action ? "✓" : "●";
  const glyphColor = summaryOnly ? "text-unverified" : action ? "text-green-text" : "";
  const label = `${monthDay(fact.occurred_at)} · ${
    summaryOnly ? "SUMMARY-ONLY — UNVERIFIED" : action ? "ACTION" : "VERIFIED"
  }`;
  return (
    <div
      className={`flex gap-[10px] border-t border-line py-[10px] ${absorbed ? "text-ink-secondary" : ""}`}
    >
      <span className={`flex-none ${glyphColor}`}>{glyph}</span>
      <div className="text-[13px] leading-[1.45]">
        <span
          className={`font-mono text-[10px] ${summaryOnly ? "text-unverified" : "text-ink-muted"}`}
        >
          {label}
        </span>
        <br />
        {fact.body}{" "}
        {fact.sources?.length > 0 && (
          <button onClick={() => onShowSources(fact.sources)} className="text-[11px] text-link">
            {sourceLabel(fact.sources[0])} ↗
          </button>
        )}
        {summaryOnly && (
          <>
            <br />
            <span className="text-[11px] text-unverified">
              From an AI summary. Barred from Needs-You until a human or transcript confirms.
            </span>
          </>
        )}
      </div>
    </div>
  );
}

function ConflictEntry({
  entry,
  onShowSources,
  absorbed,
}: {
  entry: Extract<Entry, { type: "conflict" }>;
  onShowSources: (s: FactSource[]) => void;
  absorbed: boolean;
}) {
  return (
    <div
      className={`flex gap-[10px] border-t border-line py-[10px] ${absorbed ? "text-ink-secondary" : ""}`}
    >
      <span className="flex-none text-red">▲</span>
      <div className="text-[13px] leading-[1.45]">
        <span className="font-mono text-[10px] text-red-text">
          {monthDay(entry.at)} · CONFLICT — SAME FACT, DIFFERENT VALUES
        </span>
        <br />
        {entry.facts.map((f, i) => (
          <span key={f.id}>
            {i > 0 && " — but "}
            <span className="font-mono font-medium">{contestedValue(f)}</span>{" "}
            <button onClick={() => onShowSources(f.sources)} className="text-[11px] text-link">
              {sourceLabel(f.sources[0])} ↗
            </button>
          </span>
        ))}
        <br />
        <span className="text-[12px] text-red-text">
          {entry.resolved
            ? "Resolved — the losing number was corrected downstream."
            : "Resolve → the losing number is corrected downstream."}
        </span>
      </div>
    </div>
  );
}
