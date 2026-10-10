import { NextResponse } from "next/server";
import { getAnalyticsMeasurementId } from "@/src/lib/env";

// Read per request so one image can serve any GA property; see
// getAnalyticsMeasurementId for why this is not a NEXT_PUBLIC_ value.
export const dynamic = "force-dynamic";

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]{4,20}$/;

/**
 * Public, non-secret runtime config for the client. Only the GA4 measurement
 * ID lives here today; anything added must be safe to show every visitor.
 */
export function GET() {
  const measurementId = getAnalyticsMeasurementId();
  return NextResponse.json(
    { gaMeasurementId: MEASUREMENT_ID_PATTERN.test(measurementId) ? measurementId : "" },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
