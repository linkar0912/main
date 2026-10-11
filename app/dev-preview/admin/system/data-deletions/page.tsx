import { notFound } from "next/navigation";

import { DataDeletionRequests } from "@/src/components/admin/deletions/data-deletion-requests";
import { dataDeletionRequests, previewState } from "../../fixtures";

export default async function SystemDataDeletionsPreview({ searchParams }: PageProps<"/dev-preview/admin/system/data-deletions">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  return <DataDeletionRequests requests={state === "empty" ? [] : dataDeletionRequests} />;
}
