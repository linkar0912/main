import { notFound } from "next/navigation";

import { AdminDetailSkeleton, AdminOverviewSkeleton, AdminTableSkeleton } from "@/src/components/skeleton";
import { PreviewErrorState } from "../_preview/error-states";

// The owner console's loading and error screens, as the route files render
// them: ?view=overview | table | detail | error | system-error.
export default async function AdminStatesPreview({ searchParams }: PageProps<"/dev-preview/admin/states">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const { view } = await searchParams;
  if (view === "table") return <AdminTableSkeleton />;
  if (view === "detail") return <AdminDetailSkeleton />;
  if (view === "error") return <PreviewErrorState />;
  if (view === "system-error") return <PreviewErrorState system />;
  return <AdminOverviewSkeleton />;
}
