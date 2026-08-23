import { BroadcastsScreen } from "@/src/components/broadcasts-screen";

export const metadata = { title: "Broadcasts · Linkar" };

// BroadcastsScreen renders its own AppShell (like the other client screens),
// so wrapping it here would draw the sidebar twice.
export default function BroadcastsPage() {
  return <BroadcastsScreen />;
}
