// Aging math — HARD RULE 6: day counts are computed from immutable basis
// dates at render time, NEVER stored. A skipped run can never reset them.

/** Calendar days between a basis date (YYYY-MM-DD) and now. */
export function daysSince(basisDate: string, now: Date = new Date()): number {
  const basis = new Date(`${basisDate}T00:00:00`);
  const ms = startOfDay(now).getTime() - startOfDay(basis).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Business days (Mon–Fri) elapsed between basis date and now, exclusive of basis day. */
export function businessDaysSince(basisDate: string, now: Date = new Date()): number {
  const from = startOfDay(new Date(`${basisDate}T00:00:00`));
  const to = startOfDay(now);
  if (to <= from) return 0;
  let count = 0;
  const d = new Date(from);
  while (d < to) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) count += 1;
  }
  return count;
}

/** Calendar days past a party's own committed date; 0 if none or not past. */
export function daysOver(committedDate: string | null, now: Date = new Date()): number {
  if (!committedDate) return 0;
  const committed = startOfDay(new Date(`${committedDate}T00:00:00`));
  const ms = startOfDay(now).getTime() - committed.getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

/** Aging ramp (SPEC-tokens.md): d≥4t → #8F2D22, d≥2t → #A0501F, d≥t → #9A7217, else ink-secondary. */
export function agingColor(days: number, t: number): string {
  if (days >= 4 * t) return "#8F2D22";
  if (days >= 2 * t) return "#A0501F";
  if (days >= t) return "#9A7217";
  return "#6E685C";
}

function startOfDay(d: Date): Date {
  const c = new Date(d);
  c.setHours(0, 0, 0, 0);
  return c;
}

/** "Tuesday 4 Aug" — serif page title format from the canvas. */
export function formatDateTitle(d: Date = new Date()): string {
  const weekday = d.toLocaleDateString("en-GB", { weekday: "long" });
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "short" });
  return `${weekday} ${day} ${month}`;
}

/** "6:02a" — mono run-receipt time format. */
export function formatRunTime(iso: string): string {
  const d = new Date(iso);
  let h = d.getHours();
  const suffix = h >= 12 ? "p" : "a";
  h = h % 12 || 12;
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}${suffix}`;
}

/** Friday of the current week (for the "yours by Fri" tile). */
export function isDueThisWeek(bucket: string | null): boolean {
  return bucket === "today" || bucket === "few_days" || bucket === "this_week";
}
