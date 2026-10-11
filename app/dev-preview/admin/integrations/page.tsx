import { notFound } from "next/navigation";

import { IntegrationsConsole } from "@/src/components/admin/integrations/integrations-console";
import { integrations, integrationsLong, previewState } from "../fixtures";

export default async function IntegrationsPreview({ searchParams }: PageProps<"/dev-preview/admin/integrations">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  return <IntegrationsConsole items={state === "empty" ? [] : state === "long" ? integrationsLong : integrations} filters={{}} />;
}
