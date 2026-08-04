"use client";

import type { FactSource } from "@/lib/types";

// Every fact shows provenance as a working link (hard rule 1). Until
// deep-link reliability is proven, the ↗ opens this detail sheet —
// sender / timestamp / subject — with an "Open in Outlook / Fireflies"
// attempt (README, Interactions & Behavior).

export function sourceLabel(s: FactSource): string {
  const d = new Date(s.timestamp);
  const date = `${d.toLocaleDateString("en-GB", { month: "short" })} ${d.getDate()}`;
  if (s.type === "meeting") return `${s.title ?? "Meeting"} · ${date}`;
  const name = (s.sender ?? "").replace(/<.*>/, "").trim().split(" ").pop() ?? "Source";
  return `${name}, ${date}`;
}

function externalAttempt(s: FactSource): { href: string; label: string } | null {
  const ref = s.external_ref;
  if (!ref) return null;
  if (ref.startsWith("http")) return { href: ref, label: "Open source ↗" };
  if (ref.startsWith("outlook:"))
    return {
      href: `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(ref.slice(8))}`,
      label: "Open in Outlook ↗",
    };
  if (ref.startsWith("fireflies:"))
    return {
      href: `https://app.fireflies.ai/view/${encodeURIComponent(ref.slice(10))}`,
      label: "Open in Fireflies ↗",
    };
  return null;
}

export default function ProvenanceSheet({
  sources,
  onClose,
}: {
  sources: FactSource[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] border-t border-ink bg-paper px-[18px] pt-[14px] pb-[max(env(safe-area-inset-bottom),14px)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-[10px] flex items-center justify-between">
          <span className="font-mono text-[10px] tracking-[1px] text-ink-muted">
            PROVENANCE
          </span>
          <button
            onClick={onClose}
            className="min-h-[44px] px-[8px] font-mono text-[11px] text-ink-muted"
          >
            CLOSE ✕
          </button>
        </div>
        <div className="flex flex-col gap-[8px]">
          {sources.map((s, i) => {
            const attempt = externalAttempt(s);
            const ts = new Date(s.timestamp);
            return (
              <div
                key={i}
                className="border border-line bg-paper-raised px-[12px] py-[11px] text-[13px] leading-[1.45] text-ink-body"
              >
                <div className="font-mono text-[10px] uppercase tracking-[1px] text-ink-muted">
                  {s.type}
                </div>
                {s.sender && <div className="mt-[4px]">{s.sender}</div>}
                {s.attendees && (
                  <div className="mt-[4px]">{s.attendees.join(", ")}</div>
                )}
                <div className="mt-[2px] text-ink-secondary">
                  {ts.toLocaleString("en-GB", {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                  {(s.subject ?? s.title) && <> · {s.subject ?? s.title}</>}
                </div>
                {attempt && (
                  <a
                    href={attempt.href}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-[8px] inline-block border border-line-strong px-[10px] py-[7px] font-mono text-[11px] text-ink"
                  >
                    {attempt.label}
                  </a>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
