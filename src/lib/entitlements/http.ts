import { NextResponse } from "next/server";

import { EntitlementError } from "./service";

export function entitlementErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof EntitlementError)) return null;
  return NextResponse.json({
    error: error.code,
    capability: error.capability,
    ...(error.used === undefined ? {} : { used: error.used }),
    ...(error.limit === undefined ? {} : { limit: error.limit }),
  }, { status: error.code === "entitlement_required" ? 403 : 409 });
}

export function utcMonthStart(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
}
