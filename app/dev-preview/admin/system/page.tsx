import { notFound } from "next/navigation";

import { SystemConsole } from "@/src/components/admin/system/system-console";
import { systemSnapshot, systemSnapshotAllNormal, systemSnapshotWithProblems } from "../fixtures";

// ?state=problems shows a bad day, ?state=normal a fully quiet one.
export default async function SystemPreview({ searchParams }: PageProps<"/dev-preview/admin/system">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { state } = await searchParams;
  const snapshot = state === "problems" ? systemSnapshotWithProblems : state === "normal" ? systemSnapshotAllNormal : systemSnapshot;
  return <SystemConsole snapshot={snapshot} />;
}
