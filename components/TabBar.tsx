"use client";

// Bottom tab bar: TODAY · WAITING · ＋ · TOPICS · PEOPLE (mono 10px,
// active tab ink + 500). TODAY and WAITING are live; the rest are
// labelled surfaces, not hidden ones.
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function TabBar() {
  const pathname = usePathname();
  const active = (href: string) =>
    href === "/" ? pathname === "/" || pathname.startsWith("/topics") : pathname.startsWith(href);

  const tabCls = (on: boolean) => (on ? "font-medium text-ink" : "text-ink-muted");

  return (
    <nav className="sticky bottom-0 w-full border-t border-line bg-paper">
      <div className="mx-auto flex w-full max-w-[430px] items-center justify-between px-[18px] pt-[9px] pb-[max(env(safe-area-inset-bottom),4px)] font-mono text-[10px] text-ink-muted">
        <Link href="/" className={tabCls(active("/"))}>
          TODAY
        </Link>
        <Link href="/waiting" className={tabCls(active("/waiting"))}>
          WAITING
        </Link>
        <span
          className="bg-ink px-[10px] py-[4px] text-[14px] text-paper"
          title="Capture — arrives in Stage 2"
        >
          ＋
        </span>
        <span title="Arrives in a later screen">TOPICS</span>
        <span title="Arrives in a later screen">PEOPLE</span>
      </div>
    </nav>
  );
}
