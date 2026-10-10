import { notFound } from "next/navigation";

import { DataDeletionRequests } from "@/src/components/admin/deletions/data-deletion-requests";
import { dataDeletionRequests } from "../../fixtures";

export default function SystemDataDeletionsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DataDeletionRequests requests={dataDeletionRequests} />;
}
