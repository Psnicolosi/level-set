import Shell from "@/components/Shell";
import HomeScreen from "@/components/home/HomeScreen";

// S1 · HOME / TODAY — Stage 1, Screen 1.
// Six seconds: three counts. Six minutes: the pass.
export default function Page() {
  return (
    <Shell>
      <HomeScreen />
    </Shell>
  );
}
