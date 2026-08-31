import { NextResponse } from "next/server";

import { getPlatformOwnerSession } from "@/src/lib/admin/authorization";
import { loadAdminOverview } from "@/src/lib/admin/overview";

function noStoreJson(body: unknown, init: ResponseInit = {}): NextResponse {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(): Promise<NextResponse> {
  try {
    await getPlatformOwnerSession();
    return noStoreJson({ data: await loadAdminOverview() });
  } catch (error) {
    if (
      typeof error === "object" && error !== null &&
      "status" in error && typeof error.status === "number" &&
      "code" in error && typeof error.code === "string"
    ) {
      return noStoreJson({ error: error.code }, { status: error.status });
    }
    return noStoreJson({ error: "overview_unavailable" }, { status: 500 });
  }
}
