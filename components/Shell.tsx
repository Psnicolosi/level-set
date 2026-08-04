// Page shells — one app, two ergonomics (README): phone-width surfaces for
// consumption/triage, a wide panel for desktop working surfaces. The board
// shell collapses to phone width on small screens automatically.
export default function Shell({
  width = "phone",
  children,
}: {
  width?: "phone" | "board";
  children: React.ReactNode;
}) {
  const cls =
    width === "board"
      ? "mx-auto flex w-full max-w-[1104px] flex-1 flex-col px-[18px] pt-[14px] pb-[8px] md:px-[26px] md:pt-[22px]"
      : "mx-auto flex w-full max-w-[430px] flex-1 flex-col px-[18px] pt-[14px] pb-[8px]";
  return <div className={cls}>{children}</div>;
}
