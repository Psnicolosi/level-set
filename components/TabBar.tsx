"use client";

// Bottom tab bar: TODAY · WAITING · ＋ · TOPICS · PEOPLE (mono 10px,
// active tab ink + 500). Only TODAY exists in Stage 1, Screen 1 — the
// rest are labelled surfaces, not hidden ones.
const TABS = [
  { label: "TODAY", active: true },
  { label: "WAITING", active: false },
  { label: "＋", active: false, square: true },
  { label: "TOPICS", active: false },
  { label: "PEOPLE", active: false },
];

export default function TabBar() {
  return (
    <nav className="sticky bottom-0 mx-auto w-full max-w-[430px] border-t border-line bg-paper px-[18px] pb-[max(env(safe-area-inset-bottom),4px)]">
      <div className="flex items-center justify-between pt-[9px] pb-[4px] font-mono text-[10px] text-ink-muted">
        {TABS.map((t) =>
          t.square ? (
            <span
              key={t.label}
              className="bg-ink px-[10px] py-[4px] text-[14px] text-paper"
              title="Capture — arrives in Stage 2"
            >
              {t.label}
            </span>
          ) : (
            <span
              key={t.label}
              className={t.active ? "font-medium text-ink" : ""}
              title={t.active ? undefined : "Arrives in a later screen"}
            >
              {t.label}
            </span>
          ),
        )}
      </div>
    </nav>
  );
}
