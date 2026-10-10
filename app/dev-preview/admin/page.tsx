import { notFound } from "next/navigation";

import { AdminOverviewScreen } from "@/src/components/admin/admin-overview-screen";
import { overview } from "./fixtures";

export default function OverviewPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminOverviewScreen overview={overview} />;
}
