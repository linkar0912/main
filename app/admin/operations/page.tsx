import { z } from "zod";
import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { OperationsConsole } from "@/src/components/admin/operations/operations-console";
import { AdminCursorError } from "@/src/lib/admin/cursor";
import { AdminOperationFilterSchema, OperationKindSchema } from "@/src/lib/admin/operations/query-schema";
import type { AdminOperationPage } from "@/src/lib/admin/operations/types";
import { getAdminOperationsRepository } from "@/src/lib/admin/operations/repository";

type Params = Promise<Record<string, string | string[] | undefined>>;
async function Data({ searchParams }: { searchParams: Params }) {
  const raw = await searchParams;
  const one = (key: string) => typeof raw[key] === "string" && raw[key] ? raw[key] : undefined;
  const kind = OperationKindSchema.catch("automation").parse(one("kind"));
  let result: { page: AdminOperationPage; filters: Record<string, string> } | null = null;
  try {
    const filter = AdminOperationFilterSchema.parse({ workspaceId: one("workspaceId"), status: one("status"), text: one("text"), provider: one("provider"), from: one("from"), to: one("to"), cursor: one("cursor") ?? null, limit: 25 });
    const filters = Object.fromEntries(Object.entries({ kind, workspaceId: filter.workspaceId, status: filter.status, text: filter.text, provider: filter.provider, from: filter.from, to: filter.to }).filter(([, value]) => value)) as Record<string, string>;
    const page = await getAdminOperationsRepository().list(kind, filter);
    result = { page, filters };
  } catch (error) {
    if (!(error instanceof z.ZodError || error instanceof AdminCursorError)) throw error;
  }
  if (!result) return <main className="page-wrap"><h1>Operations</h1><p role="alert">Invalid operation filters. Clear the filters and try again.</p><a href="/admin/operations">Clear filters</a></main>;
  return <OperationsConsole kind={kind} page={result.page} filters={result.filters} />;
}
export default function OperationsPage({ searchParams }: { searchParams: Params }) { return <AdminRouteGuard><Data searchParams={searchParams} /></AdminRouteGuard>; }
