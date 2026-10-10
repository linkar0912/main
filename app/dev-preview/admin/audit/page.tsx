import { notFound } from "next/navigation";

import { AuditConsole } from "@/src/components/admin/audit/audit-console";
import { auditEvents } from "../fixtures";

export default function AuditPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AuditConsole events={auditEvents} nextCursor="next" filters={{ actor: "", action: "", phase: "" }} />;
}
