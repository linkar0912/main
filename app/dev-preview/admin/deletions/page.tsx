import { notFound } from "next/navigation";

import { DeletionConsole } from "@/src/components/admin/deletions/deletion-console";
import { deletionJobs } from "../fixtures";

export default function DeletionsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <DeletionConsole jobs={deletionJobs} />;
}
