import { Skeleton } from "@/src/components/skeleton";

export default function WorkspacesLoading() {
  return <main className="page-wrap"><Skeleton style={{ width: 240, height: 42 }} /><section className="panel admin-table-panel">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} style={{ display: "block", height: 64, margin: 12 }} />)}</section></main>;
}
