"use client";

import { useState } from "react";
import { useHomeData } from "@/lib/queries";
import { daysOver, formatDateTitle, formatRunTime } from "@/lib/compute";
import type { FactSource, PassItem, RunSource } from "@/lib/types";
import ProvenanceSheet from "@/components/ProvenanceSheet";
import PassFlow from "./PassFlow";
import NeedsYou from "./NeedsYou";

type Mode = "home" | "pass";

export default function HomeScreen() {
  const { data, isLoading, error } = useHomeData();
  const [mode, setMode] = useState<Mode>("home");
  const [sheetSources, setSheetSources] = useState<FactSource[] | null>(null);
  const [coverageOpen, setCoverageOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="pt-[40px] text-center font-mono text-[11px] text-ink-muted">
        LOADING LEDGER…
      </div>
    );
  }

  // Labelled-incomplete beats confident-hollow (hard rule 7): a broken or
  // unconfigured backend is stated plainly, never silently degraded.
  if (error || !data) {
    return (
      <div className="mt-[40px] border border-dashed border-amber px-[12px] py-[11px]">
        <div className="font-mono text-[10px] tracking-[1px] text-amber-text">
          LEDGER UNREACHABLE
        </div>
        <div className="mt-[6px] text-[13px] leading-[1.5] text-ink-body">
          {error instanceof Error ? error.message : "Supabase connection failed."}{" "}
          Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, and
          that the migration and seed have been applied.
        </div>
      </div>
    );
  }

  if (mode === "pass") {
    return (
      <PassFlow
        items={data.passItems}
        onExit={() => setMode("home")}
        onShowSources={setSheetSources}
        sheet={
          sheetSources && (
            <ProvenanceSheet sources={sheetSources} onClose={() => setSheetSources(null)} />
          )
        }
      />
    );
  }

  return (
    <HomeSurface
      onBegin={() => setMode("pass")}
      onShowSources={setSheetSources}
      onShowCoverage={() => setCoverageOpen(true)}
      sheet={
        <>
          {sheetSources && (
            <ProvenanceSheet sources={sheetSources} onClose={() => setSheetSources(null)} />
          )}
          {coverageOpen && (
            <CoverageSheet
              grade={data.run?.coverage_grade ?? "?"}
              sources={(data.run?.sources ?? []) as RunSource[]}
              kept={data.run?.kept_count ?? 0}
              suppressed={data.run?.suppressed_count ?? 0}
              onClose={() => setCoverageOpen(false)}
            />
          )}
        </>
      }
    />
  );
}

// ── The Home surface (canvas 5b) ────────────────────────────────────────

function HomeSurface({
  onBegin,
  onShowSources,
  onShowCoverage,
  sheet,
}: {
  onBegin: () => void;
  onShowSources: (s: FactSource[]) => void;
  onShowCoverage: () => void;
  sheet: React.ReactNode;
}) {
  const { data } = useHomeData();
  if (!data) return null;
  const { run, passItems, agingCount, yoursByFriCount, conflictCount, threshold, meanwhile } = data;

  const passMinutes = Math.max(1, Math.round(passItems.length * 1.2));

  return (
    <div className="flex flex-1 flex-col gap-[11px]">
      {/* 1 · Header row */}
      <div className="flex items-baseline justify-between">
        <h1 className="font-serif text-[24px] font-semibold">{formatDateTitle()}</h1>
        {run && (
          <span className="font-mono text-[11px] text-ink-muted">
            run {formatRunTime(run.started_at)} ✓
          </span>
        )}
      </div>

      {/* 2 · "Since last night" refresher — present only when there is a delta */}
      {run?.since_summary && (
        <div className="border border-line bg-paper-raised px-[12px] py-[10px] text-[13px] leading-[1.5] text-ink-body">
          <span className="font-mono text-[10px] tracking-[1px] text-ink-muted">
            SINCE LAST NIGHT
          </span>
          <br />
          {run.since_summary}
        </div>
      )}

      {/* 3 · Count tiles, 3-across */}
      <div className="flex gap-[8px]">
        <div className="flex-1 bg-ink px-[11px] py-[9px] text-paper">
          <div className="font-mono text-[22px] font-medium">{passItems.length}</div>
          <div className="text-[11px] text-ink-faint">your pass</div>
        </div>
        <div className="flex-1 border border-amber px-[11px] py-[9px]">
          <div className="font-mono text-[22px] font-medium text-amber-text">{agingCount}</div>
          <div className="text-[11px] text-amber-text">aging &gt; {threshold}d</div>
        </div>
        {conflictCount > 0 ? (
          <div className="flex-1 border border-red px-[11px] py-[9px]">
            <div className="font-mono text-[22px] font-medium text-red-text">{conflictCount}</div>
            <div className="text-[11px] text-red-text">
              conflict{conflictCount > 1 ? "s" : ""}
            </div>
          </div>
        ) : (
          <div className="flex-1 border border-line-strong px-[11px] py-[9px]">
            <div className="font-mono text-[22px] font-medium text-ink-secondary">{yoursByFriCount}</div>
            <div className="text-[11px] text-ink-secondary">yours by Fri</div>
          </div>
        )}
      </div>

      {/* 4 · Start your pass */}
      {passItems.length > 0 ? (
        <div className="flex flex-col gap-[6px] border border-ink px-[12px] py-[11px]">
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] tracking-[1px]">START YOUR PASS</span>
            <span className="font-mono text-[11px] text-ink-muted">~{passMinutes} min</span>
          </div>
          <div className="text-[13px] leading-[1.45] text-ink-secondary">
            Oldest pressure first: {previewLine(passItems)}.
          </div>
          <button
            onClick={onBegin}
            className="min-h-[44px] w-full bg-ink py-[9px] text-center font-mono text-[12px] text-paper"
          >
            BEGIN ▸
          </button>
        </div>
      ) : (
        <div className="border border-line bg-paper-raised px-[12px] py-[11px]">
          <div className="font-serif text-[15px] font-semibold">You&rsquo;re clear.</div>
          <div className="mt-[3px] text-[13px] text-ink-secondary">
            Nothing needs a decision right now.
          </div>
        </div>
      )}

      {/* 4b · NEEDS YOU — the card list the pass walks through (canvas 1a) */}
      <NeedsYou onShowSources={onShowSources} />

      {/* 5 · MEANWHILE */}
      {meanwhile.length > 0 && (
        <>
          <div className="font-mono text-[11px] tracking-[2px] text-ink-muted">MEANWHILE</div>
          <div className="flex flex-col gap-[7px]">
            {meanwhile.map((m) => (
              <div
                key={m.id}
                className={`border border-line bg-paper-raised px-[12px] py-[9px] text-[13px] leading-[1.45] ${
                  m.muted ? "text-ink-secondary" : "text-ink-body"
                }`}
              >
                {m.body}
                {m.source_fact ? (
                  <>
                    {" "}
                    <button
                      onClick={() => onShowSources(m.source_fact!.sources)}
                      className="text-[11px] text-link"
                    >
                      ↗
                    </button>
                  </>
                ) : m.muted ? (
                  <>
                    {" "}
                    <span
                      className="cursor-default text-[11px] text-ink-faint"
                      title="Topic ledger arrives with the Topic timeline screen"
                    >
                      read the ledger ↗
                    </span>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {/* 6 · Coverage strip — failures graded and visible, never hidden */}
      {run && (
        <div
          className={`flex items-center justify-between border border-dashed px-[11px] py-[8px] ${
            run.coverage_grade.startsWith("A") ? "border-line-strong" : "border-amber"
          }`}
        >
          <span
            className={`font-mono text-[11px] ${
              run.coverage_grade.startsWith("A") ? "text-ink-muted" : "text-amber-text"
            }`}
          >
            {coverageLabel(run.coverage_grade, run.sources as RunSource[])}
          </span>
          <button onClick={onShowCoverage} className="min-h-[44px] pl-[8px] text-[11px] text-link">
            why ↗
          </button>
        </div>
      )}

      {sheet}
    </div>
  );
}

// Live preview line, generated from the pass order itself.
function previewLine(items: PassItem[]): string {
  return items
    .slice(0, 5)
    .map((i) => {
      const over = daysOver(i.committed_date);
      const label = i.has_conflict ? `${i.topic.id} conflict` : shortLabel(i);
      return over > 0 ? `${label} (${over}d over)` : label;
    })
    .join(" → ");
}

function shortLabel(i: PassItem): string {
  if (i.source_fact?.sources?.[0]) {
    const s = i.source_fact.sources[0];
    if (s.type === "email" && s.sender && !s.sender.includes("Paul Nicolosi")) {
      // Surname including particles: "Al del Castillo" → "del Castillo".
      const parts = s.sender.replace(/<.*>/, "").trim().replace(/,$/, "").split(/\s+/);
      return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
    }
  }
  const words = i.description.replace(/[—–].*$/, "").trim().split(/\s+/);
  return words.slice(0, 3).join(" ").replace(/[.,]$/, "");
}

function coverageLabel(grade: string, sources: RunSource[]): string {
  const parts: string[] = [`COVERAGE ${grade.replace("-", "−")}`];
  for (const s of sources) {
    const c = s.counts ?? {};
    if (s.name === "mailboxes") {
      parts.push(
        c.swept === c.total ? "all boxes swept" : `${c.swept}/${c.total} mailboxes`,
      );
    } else if (s.name === "transcripts") {
      parts.push(
        grade.startsWith("A")
          ? `${c.deep} transcripts deep`
          : `${c.deep}/${c.total} transcripts deep`,
      );
    } else {
      parts.push(`${s.name}: ${s.status}`);
    }
  }
  return parts.join(" · ");
}

// ── Coverage detail sheet (Operator screen arrives Stage 3; the grade is
//    never a black box in the meantime) ─────────────────────────────────

function CoverageSheet({
  grade,
  sources,
  kept,
  suppressed,
  onClose,
}: {
  grade: string;
  sources: RunSource[];
  kept: number;
  suppressed: number;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40" onClick={onClose}>
      <div
        className="w-full max-w-[430px] border-t border-ink bg-paper px-[18px] pt-[14px] pb-[max(env(safe-area-inset-bottom),14px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-[10px] flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[1px] text-ink-muted">
            COVERAGE {grade.replace("-", "−")} — THIS RUN
          </span>
          <button onClick={onClose} className="min-h-[44px] px-[8px] font-mono text-[11px] text-ink-muted">
            CLOSE ✕
          </button>
        </div>
        <div className="flex flex-col gap-[7px]">
          {sources.map((s, i) => (
            <div
              key={i}
              className="flex items-center justify-between border border-line bg-paper-raised px-[12px] py-[9px] text-[13px]"
            >
              <span className="text-ink-body">{s.name}</span>
              <span
                className={`font-mono text-[11px] ${
                  s.status === "swept"
                    ? "text-green-text"
                    : s.status === "failed"
                      ? "text-red-text"
                      : "text-amber-text"
                }`}
              >
                {s.status === "swept" ? "✓ swept" : s.status === "failed" ? "✗ failed" : "◐ partial"}
                {s.counts &&
                  ` · ${Object.entries(s.counts)
                    .map(([k, v]) => `${k} ${v}`)
                    .join(" / ")}`}
              </span>
            </div>
          ))}
          <div className="px-[2px] pt-[4px] font-mono text-[10px] text-ink-muted">
            kept {kept} · suppressed {suppressed} — full source detail lands on the Operator screen
            (Stage 3)
          </div>
        </div>
      </div>
    </div>
  );
}
