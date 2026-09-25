import { ActivityFeed } from "@/src/components/activity-feed";

export const metadata = { title: "Inbox · Linkar" };

export default function ActivityPage() {
  return (
    <>
      <div className="page-wrap inbox-page-wrap">
        <header className="page-header">
          <div>
            <p className="eyebrow">Workspace / Inbox</p>
            <h1>Inbox</h1>
            <p className="muted page-lede">Read messages, follow up with people, and keep Page comments in view.</p>
          </div>
        </header>
        <ActivityFeed />
      </div>
    </>
  );
}
