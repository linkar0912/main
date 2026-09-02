import { AppShell } from "@/src/components/app-shell";
import { Skeleton } from "@/src/components/skeleton";

export default function Loading() {
  return (
    <AppShell>
      <div className="page-wrap" aria-label="Loading Insights">
        <Skeleton style={{ height: 116, borderRadius: 16, marginBottom: 28 }} />
        <Skeleton style={{ height: 112, borderRadius: 16, marginBottom: 20 }} />
        <Skeleton style={{ height: 360, borderRadius: 16 }} />
      </div>
    </AppShell>
  );
}
