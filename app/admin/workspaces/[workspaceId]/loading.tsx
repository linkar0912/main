import { Skeleton } from "@/src/components/skeleton";

export default function WorkspaceLoading() {
  return <main className="page-wrap"><Skeleton style={{ width: 320, height: 42 }} /><section className="panel">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} style={{ display: "block", height: 58, margin: 12 }} />)}</section></main>;
}
