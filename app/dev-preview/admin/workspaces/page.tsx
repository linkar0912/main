import { notFound } from "next/navigation";

import { WorkspacesScreen } from "@/src/components/admin/workspaces-screen";
import { previewState, workspaces, workspacesEmpty, workspacesLong } from "../fixtures";

export default async function WorkspacesPreview({ searchParams }: PageProps<"/dev-preview/admin/workspaces">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  return <WorkspacesScreen page={state === "empty" ? workspacesEmpty : state === "long" ? workspacesLong : workspaces} />;
}
