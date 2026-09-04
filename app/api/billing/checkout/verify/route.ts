import { NextResponse } from "next/server";
import { z } from "zod";

import { requireBillingOwner } from "@/src/lib/billing/authorization";
import { billingErrorResponse } from "@/src/lib/billing/http";
import { getBillingService } from "@/src/lib/billing/service";

export const runtime = "nodejs";

const VerifySchema = z.object({
  razorpay_payment_id: z.string().min(1).max(200),
  razorpay_subscription_id: z.string().min(1).max(200),
  razorpay_signature: z.string().regex(/^[a-fA-F0-9]{64}$/),
}).strict();

export async function POST(request: Request): Promise<NextResponse> {
  const guard = await requireBillingOwner(request);
  if (!guard.ok) return guard.error;
  const parsed = VerifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid_request" }, { status: 422 });
  try {
    const data = await getBillingService().verifyCheckout(guard.session.workspaceId, {
      paymentId: parsed.data.razorpay_payment_id,
      subscriptionId: parsed.data.razorpay_subscription_id,
      signature: parsed.data.razorpay_signature,
    });
    return NextResponse.json(data);
  } catch (error) {
    return billingErrorResponse(error);
  }
}
