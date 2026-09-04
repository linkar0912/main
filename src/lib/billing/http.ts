import { NextResponse } from "next/server";

import { BillingServiceError } from "./service";

export const privateJsonHeaders = { "cache-control": "private, no-store" } as const;

export function billingErrorResponse(error: unknown): NextResponse {
  if (!(error instanceof BillingServiceError)) {
    return NextResponse.json({ error: "billing_failed" }, { status: 500 });
  }
  const status = {
    billing_not_configured: 503,
    invalid_checkout_signature: 401,
    subscription_conflict: 409,
    provider_unavailable: 503,
  }[error.code];
  return NextResponse.json({ error: error.code }, { status });
}
