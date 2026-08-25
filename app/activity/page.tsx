import { AppShell } from "@/src/components/app-shell";
import { ActivityFeed } from "@/src/components/activity-feed";

export const metadata = { title: "Activity · Linkar" };

export default function ActivityPage() {
  return (
    <AppShell>
      <div className="page-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / Activity</p>
            <h1>Activity</h1>
            <p className="muted page-lede">
              Every comment, DM, story mention, and link tap across your connected accounts -
              newest first. Automations react to these in real time.
            </p>
          </div>
        </header>
        <ActivityFeed />
      </div>
    </AppShell>
  );
}
