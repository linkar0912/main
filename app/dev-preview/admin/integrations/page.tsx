import { notFound } from "next/navigation";

import { IntegrationsConsole } from "@/src/components/admin/integrations/integrations-console";
import { integrations } from "../fixtures";

export default function IntegrationsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <IntegrationsConsole items={integrations} filters={{}} />;
}
