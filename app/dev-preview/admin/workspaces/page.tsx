import { notFound } from "next/navigation";

import { WorkspacesScreen } from "@/src/components/admin/workspaces-screen";
import { workspaces } from "../fixtures";

export default function WorkspacesPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <WorkspacesScreen page={workspaces} />;
}
