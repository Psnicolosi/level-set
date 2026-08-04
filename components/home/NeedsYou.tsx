"use client";

// S2 · NEEDS-YOU CARDS + conflict card (canvas 1a).
// Card anatomy: type badge row (badge + topic code / due / age), 14px
// headline (serif 15px for conflict), provenance link row. NUDGE cards
// carry the inbound-sweep receipt (hard rule 4). Conflict cards show both
// competing values with their own source links and the consequence line.
// Press-and-hold reveals Done / Snooze / → Katie — all three write to the
// topic's event stream the moment taken.

import Link from "next/link";
import { useRef, useState } from "react";
import type { Fact, FactSource, OwedItem, Party, PassItem } from "@/lib/types";
import { useHomeData, useMarkItem, type Mark } from "@/lib/queries";
import { agingColor, daysOver, daysSince } from "@/lib/compute";
import { sourceLabel } from "@/components/ProvenanceSheet";

export default function NeedsYou({
  onShowSources,
}: {
  onShowSources: (s: FactSource[]) => void;
}) {
  const { data } = useHomeData();
  const mark = useMarkItem();
  if (!data || data.passItems.length === 0) return null;
  const { passItems, threshold, partiesById, conflictFactsByGroup, blockedItems } = data;

  return (
    <>
      <div className="font-mono text-[11px] tracking-[2px] text-ink-muted">
        NEEDS YOU — {passItems.length}
      </div>
      <div className="flex flex-col gap-[9px]">
        {passItems.map((item) =>
          item.has_conflict ? (
            <ConflictCard
              key={item.id}
              item={item}
              facts={
                (item.source_fact?.conflict_group &&
                  conflictFactsByGroup.get(item.source_fact.conflict_group)) ||
                []
              }
              blocked={blockedItems}
              onShowSources={onShowSources}
              onMark={(m) => mark.mutate({ item, mark: m })}
            />
          ) : (
            <NeedsCard
              key={item.id}
              item={item}
              threshold={threshold}
              party={item.party_id ? (partiesById.get(item.party_id) ?? null) : null}
              runStartedAt={data.run?.started_at ?? null}
              onShowSources={onShowSources}
              onMark={(m) => mark.mutate({ item, mark: m })}
            />
          ),
        )}
      </div>
    </>
  );
}

// Press-and-hold (≥450ms) reveals the mark row; press again to hide.
function useHoldToReveal() {
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = () => {
    timer.current = setTimeout(() => setRevealed((r) => !r), 450);
  };
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return {
    revealed,
    holdProps: {
      onPointerDown: start,
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}

function MarkRow({ onMark }: { onMark: (m: Mark) => void }) {
  return (
    <>
      <div className="mt-[2px] flex gap-[6px]">
        <button
          onClick={() => onMark("done")}
          className="min-h-[44px] flex-1 border border-ink bg-ink py-[6px] text-center font-mono text-[11px] text-paper"
        >
          Done
        </button>
        <button
          onClick={() => onMark("snooze")}
          className="min-h-[44px] flex-1 border border-line-strong py-[6px] text-center font-mono text-[11px]"
        >
          Snooze
        </button>
        <button
          onClick={() => onMark("katie")}
          className="min-h-[44px] flex-1 border border-line-strong py-[6px] text-center font-mono text-[11px]"
        >
          → Katie
        </button>
      </div>
      <div className="font-mono text-[10px] text-ink-muted">
        press-and-hold — marks feed the next run
      </div>
    </>
  );
}

// Extract the contested value for mono-bold display; fall back to the body.
function contestedValue(f: Fact): string {
  const m = f.body.match(/\$[\d][\d,]*(?:\.\d+)?\s?[MK]?/);
  return m ? m[0] : f.body;
}

function ConflictCard({
  item,
  facts,
  blocked,
  onShowSources,
  onMark,
}: {
  item: PassItem;
  facts: Fact[];
  blocked: OwedItem[];
  onShowSources: (s: FactSource[]) => void;
  onMark: (m: Mark) => void;
}) {
  const { revealed, holdProps } = useHoldToReveal();
  const heldItems = blocked.filter((b) => b.blocked_on?.includes(item.topic.id));
  return (
    <div
      {...holdProps}
      className="flex select-none flex-col gap-[7px] border border-red px-[12px] py-[11px]"
    >
      <div className="flex items-center gap-[6px]">
        <span className="bg-red px-[6px] py-[2px] font-mono text-[10px] text-paper">
          ▲ CONFLICT
        </span>
        <Link
          href={`/topics/${item.topic.id}`}
          className="font-mono text-[10px] text-ink-secondary"
        >
          {item.topic.id}
        </Link>
      </div>
      <div className="font-serif text-[15px] leading-[1.35]">{item.description}</div>
      <div className="flex flex-col gap-[3px] text-[12px]">
        {facts
          .slice()
          .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at))
          .map((f) => (
            <div key={f.id} className="flex items-baseline justify-between gap-[8px]">
              <span className="font-mono font-medium">{contestedValue(f)}</span>
              <button
                onClick={() => onShowSources(f.sources)}
                className="text-[11px] text-link"
              >
                {sourceLabel(f.sources[0])} ↗
              </button>
            </div>
          ))}
      </div>
      {heldItems.length > 0 && (
        <div className="text-[11px] text-red-text">
          Held back until you resolve it: {heldItems.map((b) => b.description).join(" · ")}
        </div>
      )}
      {revealed && <MarkRow onMark={onMark} />}
    </div>
  );
}

function NeedsCard({
  item,
  threshold,
  party,
  runStartedAt,
  onShowSources,
  onMark,
}: {
  item: PassItem;
  threshold: number;
  party: Party | null;
  runStartedAt: string | null;
  onShowSources: (s: FactSource[]) => void;
  onMark: (m: Mark) => void;
}) {
  const { revealed, holdProps } = useHoldToReveal();
  const over = daysOver(item.committed_date);
  const age = daysSince(item.basis_date);
  const newToday =
    item.source_fact && daysSince(item.source_fact.occurred_at.slice(0, 10)) === 0;
  const src = item.source_fact?.sources?.[0] ?? null;

  const badge =
    item.needs === "nudge"
      ? "border border-amber text-amber-text"
      : "bg-ink text-paper";

  // Hard rule 4: a party may only carry a "nothing received" receipt when the
  // sweep is at least as fresh as the run and came back silent.
  const sweepFresh =
    party?.inbound_swept_at && runStartedAt && party.inbound_swept_at >= runStartedAt;
  const showReceipt = item.needs === "nudge" && sweepFresh && party?.inbound_result === "silent";
  const sweepPending = item.needs === "nudge" && party && !sweepFresh;

  return (
    <div
      {...holdProps}
      className="flex select-none flex-col gap-[5px] border border-line bg-paper-raised px-[12px] py-[11px]"
    >
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-[6px]">
          <span className={`px-[6px] py-[1px] font-mono text-[10px] ${badge}`}>
            {item.needs.toUpperCase()} · {item.topic.org_id}
          </span>
          <Link
            href={`/topics/${item.topic.id}`}
            className="font-mono text-[10px] text-ink-secondary"
          >
            {item.topic.id}
          </Link>
        </span>
        {over > 0 ? (
          <span className="font-mono text-[13px] font-medium text-red-text">{over}d over</span>
        ) : newToday ? (
          <span className="font-mono text-[11px] text-green-text">new today</span>
        ) : (
          <span
            className="font-mono text-[13px] font-medium"
            style={{ color: agingColor(age, threshold) }}
          >
            {age}d
          </span>
        )}
      </div>
      <div className="text-[14px] leading-[1.4]">
        {item.description}
        {item.deferred_at && (
          <span className="font-mono text-[10px] text-ink-muted"> · snoozed</span>
        )}
      </div>
      <div className="flex items-center justify-between text-[11px]">
        {showReceipt ? (
          <span className="text-green-text">✓ inbound swept — nothing received</span>
        ) : sweepPending ? (
          <span className="font-mono text-[10px] text-ink-muted">inbound sweep pending</span>
        ) : (
          <span />
        )}
        {src && item.source_fact && (
          <button
            onClick={() => onShowSources(item.source_fact!.sources)}
            className="text-[11px] text-link"
          >
            {sourceLabel(src)} ↗
          </button>
        )}
      </div>
      {revealed && <MarkRow onMark={onMark} />}
    </div>
  );
}
