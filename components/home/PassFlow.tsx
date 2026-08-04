"use client";

// The pass (canvas 3a → 3b → 3c): a focused sequence, oldest pressure
// first, conflicts pinned. Completed items collapse to green receipt
// rows; finishing shows the clear screen with the re-run offer — which
// appears only if actions were taken.

import { useRef, useState } from "react";
import type { FactSource, PassItem } from "@/lib/types";
import { useMarkItem } from "@/lib/queries";
import { agingColor, daysOver, daysSince, formatRunTime } from "@/lib/compute";
import { sourceLabel } from "@/components/ProvenanceSheet";
import { useHomeData } from "@/lib/queries";

interface Receipt {
  id: string;
  text: string;
  at: string; // ISO
}

export default function PassFlow({
  items,
  onExit,
  onShowSources,
  sheet,
}: {
  items: PassItem[];
  onExit: () => void;
  onShowSources: (s: FactSource[]) => void;
  sheet: React.ReactNode;
}) {
  const { data } = useHomeData();
  const threshold = data?.threshold ?? 5;
  const mark = useMarkItem();

  // The queue is fixed at pass start; done items leave it, Later items
  // move behind the remaining ones for this session only (their order on
  // reload stays strictly oldest-basis-first — the mark itself persists).
  const initialQueue = useRef<PassItem[]>(items);
  const total = initialQueue.current.length;
  const [queue, setQueue] = useState<PassItem[]>(initialQueue.current);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [actionsTaken, setActionsTaken] = useState(0);
  const startedAt = useRef(Date.now());
  const [rerunNote, setRerunNote] = useState<string | null>(null);

  const current = queue[0] ?? null;
  const upcoming = queue.slice(1);
  const doneCount = receipts.length;

  function act(item: PassItem) {
    mark.mutate({ item, mark: "done" });
    setReceipts((r) => [
      ...r,
      {
        id: item.id,
        text: `✓ ${receiptLabel(item)} — ${verbFor(item)}`,
        at: new Date().toISOString(),
      },
    ]);
    setActionsTaken((n) => n + 1);
    setQueue((q) => q.filter((i) => i.id !== item.id));
  }

  function later(item: PassItem) {
    mark.mutate({ item, mark: "later" });
    setQueue((q) => {
      const rest = q.filter((i) => i.id !== item.id);
      return [...rest, { ...item, deferred_at: new Date().toISOString() }];
    });
  }

  // Deferred-to-end items eventually come back around; leaving via LATER on
  // the final remaining item ends the session without a clear screen —
  // clear fires ONLY when the pass is actually empty.
  const allDeferred = queue.length > 0 && queue.every((i) => i.deferred_at);

  if (queue.length === 0) {
    return (
      <ClearScreen
        total={total}
        minutes={Math.max(1, Math.round((Date.now() - startedAt.current) / 60_000))}
        receipts={receipts}
        actionsTaken={actionsTaken}
        rerunNote={rerunNote}
        onRerun={(when) =>
          setRerunNote(
            when === "now"
              ? "Re-run queued. The sweep pipeline arrives with the Operator stage — until then, runs are recorded by the ingestion agent."
              : "Noted — the noon incremental will pick this up.",
          )
        }
        onExit={onExit}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-[12px]">
      {/* Header: position + progress dots */}
      <div className="flex items-center justify-between">
        <button onClick={onExit} className="min-h-[44px] font-mono text-[11px] text-ink-muted">
          ‹ YOUR PASS
        </button>
        <span className="font-mono text-[11px]">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className={
                i < doneCount
                  ? "text-green-text"
                  : i === doneCount
                    ? "text-ink"
                    : "text-line-strong"
              }
            >
              ●
            </span>
          ))}
          <span className="text-ink-secondary">
            &nbsp;&nbsp;{Math.min(doneCount + 1, total)} of {total}
          </span>
        </span>
      </div>

      {/* Completed receipts */}
      {receipts.length > 0 && (
        <div className="flex flex-col gap-[7px]">
          {receipts.map((r) => (
            <div
              key={r.id}
              className="flex justify-between border border-green bg-green-fill px-[12px] py-[8px] text-[12px] text-green-text"
            >
              <span>{r.text}</span>
              <span className="font-mono">{formatRunTime(r.at)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Current card, expanded */}
      {current && (
        <CurrentCard
          item={current}
          position={doneCount + 1}
          total={total}
          threshold={threshold}
          onAct={() => act(current)}
          onLater={() => later(current)}
          onShowSources={onShowSources}
          allDeferred={allDeferred}
        />
      )}

      {/* Upcoming, collapsed */}
      {upcoming.length > 0 && (
        <div className="flex flex-col gap-[7px] opacity-55">
          {upcoming.map((i, idx) => (
            <div
              key={i.id}
              className="border border-line bg-paper-raised px-[12px] py-[9px] text-[13px] text-ink-secondary"
            >
              {doneCount + idx + 2} of {total} · {i.needs.toUpperCase()} ·{" "}
              {receiptLabel(i)}
              {i.deferred_at ? " · later" : ""}
            </div>
          ))}
        </div>
      )}

      <div className="mt-auto pb-[4px] text-center font-mono text-[10px] text-ink-muted">
        Each action is logged to its topic the moment you take it.
      </div>

      {sheet}
    </div>
  );
}

function CurrentCard({
  item,
  position,
  total,
  threshold,
  onAct,
  onLater,
  onShowSources,
  allDeferred,
}: {
  item: PassItem;
  position: number;
  total: number;
  threshold: number;
  onAct: () => void;
  onLater: () => void;
  onShowSources: (s: FactSource[]) => void;
  allDeferred: boolean;
}) {
  const over = daysOver(item.committed_date);
  const age = daysSince(item.basis_date);
  const src = item.source_fact?.sources?.[0] ?? null;
  const newToday =
    item.source_fact && daysSince(item.source_fact.occurred_at.slice(0, 10)) === 0;

  const badge = item.has_conflict
    ? "bg-red text-paper"
    : item.needs === "nudge"
      ? "border border-amber text-amber-text"
      : "bg-ink text-paper";

  const border = item.has_conflict ? "border-red" : "border-ink";

  return (
    <div className={`flex flex-col gap-[7px] border ${border} px-[13px] py-[12px]`}>
      <div className="flex items-center justify-between">
        <span className={`px-[6px] py-[2px] font-mono text-[10px] ${badge}`}>
          {position} OF {total} · {item.has_conflict ? "▲ CONFLICT" : item.needs.toUpperCase()} ·{" "}
          {item.topic.org_id}
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
        {item.description}{" "}
        {item.refresher && (
          <span className="text-ink-secondary">Refresher: {item.refresher}</span>
        )}
      </div>

      {/* Inline draft preview when one exists */}
      {item.draft_preview && (
        <div className="border border-line bg-paper-raised px-[11px] py-[9px] text-[12px] leading-[1.5] text-ink-body">
          {item.draft_preview}
        </div>
      )}

      {/* Provenance — a working link on every card (hard rule 1) */}
      {src && (
        <button
          onClick={() => item.source_fact && onShowSources(item.source_fact.sources)}
          className="self-start text-[11px] text-link"
        >
          {sourceLabel(src)} ↗
        </button>
      )}

      <div className="flex gap-[6px] font-mono text-[11px]">
        <button
          onClick={onAct}
          className="min-h-[44px] flex-[1.4] bg-ink py-[7px] text-center text-paper"
        >
          {item.draft_preview ? "ACT — DRAFT READY ▸" : "ACT ▸"}
        </button>
        <button
          onClick={onLater}
          className="min-h-[44px] flex-1 border border-line-strong py-[7px] text-center text-ink"
        >
          LATER
        </button>
      </div>

      {allDeferred && (
        <div className="font-mono text-[10px] text-ink-muted">
          Everything left is deferred — LATER again keeps it for the next pass.
        </div>
      )}
    </div>
  );
}

// ── Clear screen (canvas 3c) — fires only when the pass is empty ────────

function ClearScreen({
  total,
  minutes,
  receipts,
  actionsTaken,
  rerunNote,
  onRerun,
  onExit,
}: {
  total: number;
  minutes: number;
  receipts: Receipt[];
  actionsTaken: number;
  rerunNote: string | null;
  onRerun: (when: "now" | "noon") => void;
  onExit: () => void;
}) {
  return (
    <div className="flex flex-1 flex-col gap-[14px]">
      <div className="pt-[26px]">
        <div className="font-serif text-[30px] font-semibold leading-[1.15]">You&rsquo;re clear.</div>
        <div className="mt-[6px] text-[13px] leading-[1.5] text-ink-secondary">
          {total} of {total} handled in {minutes} minute{minutes === 1 ? "" : "s"}. Nothing
          consequential is waiting on you.
        </div>
      </div>

      {receipts.length > 0 && (
        <div className="flex flex-col gap-[8px] border border-line px-[14px] py-[12px] text-[13px]">
          <div className="font-mono text-[10px] tracking-[1px] text-ink-muted">
            THIS MORNING YOU
          </div>
          {receipts.map((r) => (
            <div key={r.id} className="flex justify-between">
              <span>{r.text.replace(/^✓ /, "")}</span>
              <span className="font-mono text-[11px] text-green-text">✓ logged</span>
            </div>
          ))}
        </div>
      )}

      {/* Re-run offer — ONLY when actions were taken this pass */}
      {actionsTaken > 0 && (
        <div className="flex flex-col gap-[9px] border border-ink px-[14px] py-[13px]">
          <div className="text-[14px] leading-[1.5]">
            Your actions changed the picture — <b>re-run the level set?</b>
          </div>
          {rerunNote ? (
            <div className="border border-line bg-paper-raised px-[11px] py-[8px] text-[12px] text-ink-secondary">
              {rerunNote}
            </div>
          ) : (
            <div className="flex gap-[6px] font-mono text-[11px]">
              <button
                onClick={() => onRerun("now")}
                className="min-h-[44px] flex-[1.4] bg-ink py-[9px] text-center text-paper"
              >
                RE-RUN NOW ▸
              </button>
              <button
                onClick={() => onRerun("noon")}
                className="min-h-[44px] flex-1 border border-line-strong py-[9px] text-center"
              >
                AT NOON
              </button>
            </div>
          )}
          <div className="font-mono text-[10px] text-ink-muted">
            ~2 min. Incremental — only what your sends touched, plus new inbound. Or set to auto
            after every cleared pass.
          </div>
        </div>
      )}

      <button
        onClick={onExit}
        className="mt-auto min-h-[44px] border border-line-strong py-[9px] text-center font-mono text-[11px] text-ink"
      >
        ‹ BACK TO TODAY
      </button>
    </div>
  );
}

function receiptLabel(i: PassItem): string {
  const d = i.description.replace(/\.$/, "");
  return d.length > 52 ? `${d.slice(0, 49)}…` : d;
}

function verbFor(i: PassItem): string {
  if (i.needs === "send") return "sent";
  if (i.needs === "nudge") return "nudged";
  return "answered";
}
