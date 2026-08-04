"use client";

// S4 · WAITING BOARD (canvas 1c) — desktop-first working surface.
// Filters: ALL / >t DAYS / PAST OWN DATE / KATIE'S. Grid: DAYS (mono 20px,
// aging-ramp color; · if blocked) · PARTY (+org) · THEY OWE (+↗) · NOTE
// (red if past own date) · CHASER · INBOUND (green sweep receipt or —).
// Rows sorted days desc; blocked rows show their blocker, not an age, and
// sink to the bottom. Every count is computed at render — never stored.
// Mobile: the same list as two-line rows.

import { useMemo, useState } from "react";
import type { FactSource } from "@/lib/types";
import { useWaitingBoard, type WaitingRow } from "@/lib/waiting-queries";
import { agingColor, daysOver, daysSince } from "@/lib/compute";
import ProvenanceSheet, { sourceLabel } from "@/components/ProvenanceSheet";

type Filter = "all" | "aging" | "past_own" | "katies";

export default function WaitingBoard() {
  const { data, isLoading, error } = useWaitingBoard();
  const [filter, setFilter] = useState<Filter>("all");
  const [sheetSources, setSheetSources] = useState<FactSource[] | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const t = data.threshold;
    return data.rows
      .filter((r) => {
        if (filter === "aging") return r.state !== "blocked" && daysSince(r.basis_date) > t;
        if (filter === "past_own") return daysOver(r.committed_date) > 0; // committed_date, per acceptance
        if (filter === "katies") return r.owner === "katie";
        return true;
      })
      .sort((a, b) => {
        const da = a.state === "blocked" ? -1 : daysSince(a.basis_date);
        const db = b.state === "blocked" ? -1 : daysSince(b.basis_date);
        return db - da;
      });
  }, [data, filter]);

  if (isLoading) {
    return (
      <div className="pt-[40px] text-center font-mono text-[11px] text-ink-muted">
        LOADING BOARD…
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="mt-[40px] border border-dashed border-amber px-[12px] py-[11px]">
        <div className="font-mono text-[10px] tracking-[1px] text-amber-text">
          BOARD UNREACHABLE
        </div>
        <div className="mt-[6px] text-[13px] leading-[1.5] text-ink-body">
          {error instanceof Error ? error.message : "Supabase connection failed."} If the
          message mentions a missing waiting_board relation, the 0002 migration has not been
          applied yet.
        </div>
      </div>
    );
  }

  const openCount = data.rows.length;

  const FILTERS: { key: Filter; label: string }[] = [
    { key: "all", label: "ALL" },
    { key: "aging", label: `> ${data.threshold} DAYS` },
    { key: "past_own", label: "PAST OWN DATE" },
    { key: "katies", label: "KATIE'S" },
  ];

  return (
    <div className="flex flex-1 flex-col gap-[16px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[8px]">
        <h1 className="font-serif text-[24px] font-semibold">
          Waiting board — {openCount} open commitment{openCount === 1 ? "" : "s"}
        </h1>
        <div className="flex gap-[8px] font-mono text-[11px]">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`min-h-[32px] px-[9px] py-[3px] ${
                filter === f.key
                  ? "bg-ink text-paper"
                  : "border border-line-strong text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Desktop grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-[64px_210px_1fr_160px_90px_150px] gap-x-[8px] px-[16px] font-mono text-[10px] tracking-[1px] text-ink-muted">
          <span>DAYS</span>
          <span>PARTY</span>
          <span>THEY OWE</span>
          <span>NOTE</span>
          <span>CHASER</span>
          <span>INBOUND</span>
        </div>
        <div className="flex flex-col">
          {rows.map((r) => (
            <DesktopRow key={r.id} row={r} threshold={data.threshold} runStartedAt={data.run?.started_at ?? null} onShowSources={setSheetSources} />
          ))}
        </div>
      </div>

      {/* Mobile: same list, two-line rows */}
      <div className="flex flex-col md:hidden">
        {rows.map((r) => (
          <MobileRow key={r.id} row={r} threshold={data.threshold} runStartedAt={data.run?.started_at ?? null} onShowSources={setSheetSources} />
        ))}
      </div>

      {rows.length === 0 && (
        <div className="border border-line bg-paper-raised px-[12px] py-[11px] text-[13px] text-ink-secondary">
          Nothing matches this filter.
        </div>
      )}

      <div className="text-[12px] text-ink-muted">
        Day counts are computed from source dates, never stored — a skipped run cannot reset
        them. &ldquo;Inbound&rdquo; is re-swept every run before anyone is shown as silent.
      </div>

      {sheetSources && (
        <ProvenanceSheet sources={sheetSources} onClose={() => setSheetSources(null)} />
      )}
    </div>
  );
}

function rowBits(row: WaitingRow, threshold: number, runStartedAt: string | null) {
  const blocked = row.state === "blocked";
  const days = daysSince(row.basis_date);
  const over = daysOver(row.committed_date);
  const daysLabel = blocked ? "·" : String(days);
  const daysColor = blocked ? "#B5B0A4" : agingColor(days, threshold);

  let note = "";
  let noteRed = false;
  if (blocked) {
    note = `blocked: ${row.blocked_on ?? "upstream"}`;
  } else if (over > 0) {
    note = `${over}d past their own date`;
    noteRed = true; // red if past own date (acceptance)
  } else if (row.last_chased_at) {
    const d = new Date(row.last_chased_at);
    note = `chased ${d.toLocaleDateString("en-GB", { month: "short", day: "numeric" })}`;
  }

  // HARD RULE 4: a party reads as silent only with a sweep at least as fresh
  // as the run. Anything else renders as "—", never as unresponsive.
  const sweepFresh =
    row.party?.inbound_swept_at && runStartedAt && row.party.inbound_swept_at >= runStartedAt;
  const inbound = sweepFresh
    ? row.party!.inbound_result === "silent"
      ? "✓ swept — silent"
      : "✓ received"
    : "—";
  const inboundGreen = inbound !== "—";

  return { blocked, daysLabel, daysColor, note, noteRed, inbound, inboundGreen };
}

function DesktopRow({
  row,
  threshold,
  runStartedAt,
  onShowSources,
}: {
  row: WaitingRow;
  threshold: number;
  runStartedAt: string | null;
  onShowSources: (s: FactSource[]) => void;
}) {
  const b = rowBits(row, threshold, runStartedAt);
  return (
    <div className="grid grid-cols-[64px_210px_1fr_160px_90px_150px] items-center gap-x-[8px] border-t border-line px-[16px] py-[12px]">
      <span className="font-mono text-[20px] font-medium" style={{ color: b.daysColor }}>
        {b.daysLabel}
      </span>
      <span className="text-[13px]">
        <span className="font-medium">{row.party?.name ?? "—"}</span>
        <br />
        <span className="text-[11px] text-ink-muted">{row.party?.org_affiliation ?? row.topic?.org_id}</span>
      </span>
      <span className="text-[13px] leading-[1.35]">
        {row.description}{" "}
        {row.source_fact && (
          <button onClick={() => onShowSources(row.source_fact!.sources)} className="text-[11px] text-link">
            ↗
          </button>
        )}
      </span>
      <span className={`text-[11px] ${b.noteRed ? "text-red-text" : "text-ink-muted"}`}>{b.note}</span>
      <span className="font-mono text-[11px] text-ink-secondary">{row.owner === "paul" ? "Paul" : row.owner === "katie" ? "Katie" : row.owner}</span>
      <span className={`text-[11px] ${b.inboundGreen ? "text-green-text" : "text-ink-faint"}`}>{b.inbound}</span>
    </div>
  );
}

function MobileRow({
  row,
  threshold,
  runStartedAt,
  onShowSources,
}: {
  row: WaitingRow;
  threshold: number;
  runStartedAt: string | null;
  onShowSources: (s: FactSource[]) => void;
}) {
  const b = rowBits(row, threshold, runStartedAt);
  return (
    <div className="flex gap-[12px] border-t border-line py-[10px]">
      <span className="w-[38px] flex-none font-mono text-[20px] font-medium" style={{ color: b.daysColor }}>
        {b.daysLabel}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] leading-[1.35]">
          <span className="font-medium">{row.party?.name ?? "—"}</span> — {row.description}{" "}
          {row.source_fact && (
            <button onClick={() => onShowSources(row.source_fact!.sources)} className="text-[11px] text-link">
              ↗
            </button>
          )}
        </div>
        <div className="mt-[2px] flex flex-wrap gap-x-[10px] text-[11px]">
          {b.note && <span className={b.noteRed ? "text-red-text" : "text-ink-muted"}>{b.note}</span>}
          <span className="font-mono text-ink-secondary">{row.owner === "paul" ? "Paul" : "Katie"}</span>
          <span className={b.inboundGreen ? "text-green-text" : "text-ink-faint"}>{b.inbound}</span>
        </div>
      </div>
    </div>
  );
}
