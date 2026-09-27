import { BroadcastsScreen } from "@/src/components/broadcasts-screen";

export const metadata = { title: "Broadcasts · Linkar" };

// The (app) route group's layout mounts the AppShell around this screen.
export default function BroadcastsPage() {
  return <BroadcastsScreen />;
}
