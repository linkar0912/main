import { notFound } from "next/navigation";

import { AdminOverviewScreen } from "@/src/components/admin/admin-overview-screen";
import { overview, overviewEmpty, overviewLong, previewState } from "./fixtures";

// ?state=empty is a brand-new install; ?state=long has huge numbers and long text.
export default async function OverviewPreview({ searchParams }: PageProps<"/dev-preview/admin">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  return <AdminOverviewScreen overview={state === "empty" ? overviewEmpty : state === "long" ? overviewLong : overview} />;
}
