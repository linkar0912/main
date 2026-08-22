import { AppShell } from "@/src/components/app-shell";
import { SequencesScreen } from "@/src/components/sequences-screen";

export const metadata = { title: "Sequences · Linkar" };

export default function SequencesPage() {
  return (
    <AppShell>
      <SequencesScreen />
    </AppShell>
  );
}
