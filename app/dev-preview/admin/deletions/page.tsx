import { notFound } from "next/navigation";

import { DeletionConsole } from "@/src/components/admin/deletions/deletion-console";
import { deletionJobs, deletionJobsLong, previewState } from "../fixtures";

export default async function DeletionsPreview({ searchParams }: PageProps<"/dev-preview/admin/deletions">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  return <DeletionConsole jobs={state === "empty" ? [] : state === "long" ? deletionJobsLong : deletionJobs} />;
}
