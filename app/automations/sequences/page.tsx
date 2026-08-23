import { SequencesScreen } from "@/src/components/sequences-screen";

export const metadata = { title: "Sequences · Linkar" };

// SequencesScreen renders its own AppShell (like the other client screens),
// so wrapping it here would draw the sidebar twice.
export default function SequencesPage() {
  return <SequencesScreen />;
}
