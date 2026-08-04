import Shell from "@/components/Shell";
import WaitingBoard from "@/components/waiting/WaitingBoard";

// S4 · WAITING BOARD — Stage 1, Screen 4 (canvas 1c). Desktop-first;
// the same list renders as two-line rows on the phone.
export default function Page() {
  return (
    <Shell width="board">
      <WaitingBoard />
    </Shell>
  );
}
