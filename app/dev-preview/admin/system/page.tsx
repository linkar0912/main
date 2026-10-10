import { notFound } from "next/navigation";

import { SystemConsole } from "@/src/components/admin/system/system-console";
import { systemSnapshot } from "../fixtures";

export default function SystemPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <SystemConsole snapshot={systemSnapshot} />;
}
