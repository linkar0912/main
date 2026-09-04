import { AppShell } from "@/src/components/app-shell";
import { ActivityFeed } from "@/src/components/activity-feed";

export const metadata = { title: "Inbox · Linkar" };

export default function ActivityPage() {
  return (
    <AppShell>
      <div className="page-wrap inbox-page-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / Inbox</p>
            <h1>Inbox</h1>
            <p className="muted page-lede">Every Instagram contact, conversation, and human reply in one place.</p>
          </div>
        </header>
        <ActivityFeed />
      </div>
    </AppShell>
  );
}
