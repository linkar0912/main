import { AppShell } from "@/src/components/app-shell";
import { Skeleton } from "@/src/components/skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="page-wrap quick-automation-page" aria-label="Loading Quick Automation">
        <Skeleton style={{ height: 110, borderRadius: 16 }} />
        <div className="quick-reel-grid">
          {[0, 1, 2, 3].map((item) => <Skeleton key={item} style={{ height: 330, borderRadius: 14 }} />)}
        </div>
      </div>
    </AppShell>
  );
}
