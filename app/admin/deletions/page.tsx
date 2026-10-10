import { redirect } from "next/navigation";

import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { DeletionConsole } from "@/src/components/admin/deletions/deletion-console";
import { parseAdminPageHistory } from "@/src/components/admin/shared/admin-pagination";
import { AdminCursorError } from "@/src/lib/admin/cursor";
import { listDeletionJobs } from "@/src/lib/admin/deletion/repository";

type SearchParams = Promise<{ cursor?: string | string[]; prev?: string | string[] }>;

async function Data({ searchParams }: { searchParams: SearchParams }) {
  const input = await searchParams;
  const cursor = typeof input.cursor === "string" && input.cursor ? input.cursor : null;
  const page = await listDeletionJobs({ cursor }).catch((error: unknown) => {
    // A stale or edited cursor restarts the listing instead of failing the page.
    if (error instanceof AdminCursorError) redirect("/admin/deletions");
    throw error;
  });
  return <DeletionConsole jobs={page.items} cursor={cursor} history={cursor ? parseAdminPageHistory(input.prev) : []} nextCursor={page.nextCursor} />;
}

export default function AdminDeletionsPage({ searchParams }: { searchParams: SearchParams }) {
  return <AdminRouteGuard><Data searchParams={searchParams} /></AdminRouteGuard>;
}
