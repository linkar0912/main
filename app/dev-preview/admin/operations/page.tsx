import { notFound } from "next/navigation";

import { OperationsConsole } from "@/src/components/admin/operations/operations-console";
import { operations } from "../fixtures";

export default function OperationsPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <OperationsConsole kind="automation" page={{ items: operations, nextCursor: "next" }} filters={{ kind: "automation" }} />;
}
