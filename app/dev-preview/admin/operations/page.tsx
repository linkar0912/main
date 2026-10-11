import { notFound } from "next/navigation";

import { OperationsConsole } from "@/src/components/admin/operations/operations-console";
import { operations, operationsLong, previewState } from "../fixtures";

export default async function OperationsPreview({ searchParams }: PageProps<"/dev-preview/admin/operations">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  const items = state === "empty" ? [] : state === "long" ? operationsLong : operations;
  return <OperationsConsole kind="automation" page={{ items, nextCursor: state === "empty" ? null : "next" }} filters={{ kind: "automation" }} />;
}
