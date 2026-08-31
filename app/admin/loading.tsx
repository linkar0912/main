import { Skeleton } from "@/src/components/skeleton";

export default function AdminOverviewLoading() {
  return (
    <main className="page-wrap" aria-busy="true" aria-live="polite">
      <Skeleton style={{ height: 12, width: 150 }} />
      <Skeleton style={{ height: 38, width: 300, marginTop: 12 }} />
      <Skeleton style={{ height: 14, width: 480, maxWidth: "100%", marginTop: 10 }} />
      <div className="metrics-grid" style={{ marginTop: 28 }}>
        {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} style={{ height: 132, borderRadius: 14 }} />)}
      </div>
      <div className="admin-overview-grid">
        <Skeleton style={{ height: 280, borderRadius: 18 }} />
        <Skeleton style={{ height: 520, borderRadius: 18 }} />
      </div>
    </main>
  );
}
