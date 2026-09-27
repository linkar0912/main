import { SequencesScreen } from "@/src/components/sequences-screen";

export const metadata = { title: "Sequences · Linkar" };

// The (app) route group's layout mounts the AppShell around this screen.
export default function SequencesPage() {
  return <SequencesScreen />;
}
