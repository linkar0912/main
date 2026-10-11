"use client";

import AdminError from "@/app/admin/error";
import SystemError from "@/app/admin/system/error";

/** The route error screens need a client-side retry callback. */
export function PreviewErrorState({ system = false }: { system?: boolean }) {
  return system ? <SystemError retry={() => window.location.reload()} /> : <AdminError retry={() => window.location.reload()} />;
}
