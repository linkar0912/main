import { notFound } from "next/navigation";

import { AuditConsole } from "@/src/components/admin/audit/audit-console";
import { auditEvents, auditEventsLong, previewState } from "../fixtures";

export default async function AuditPreview({ searchParams }: PageProps<"/dev-preview/admin/audit">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  const events = state === "empty" ? [] : state === "long" ? auditEventsLong : auditEvents;
  return <AuditConsole events={events} nextCursor={state === "empty" ? null : "next"} filters={{ actor: "", action: "", phase: "" }} />;
}
