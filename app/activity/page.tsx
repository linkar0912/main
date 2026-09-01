import { AppShell } from "@/src/components/app-shell";
import { ActivityFeed } from "@/src/components/activity-feed";

export const metadata = { title: "Inbox · Linkar" };

export default function ActivityPage() {
  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / Inbox</p>
            <h1>Inbox</h1>
            <p className="muted page-lede">
              One live stream for Instagram conversations and Facebook Page activity. Open an
              Instagram contact to review history, update ownership, or hand it to a person.
            </p>
          </div>
        </header>
        <ActivityFeed />
      </div>
    </AppShell>
  );
}
