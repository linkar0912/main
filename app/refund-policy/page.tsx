import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { grievanceOfficerContact, legalOperatorStatement } from "@/src/lib/legal-entity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Refund and cancellation policy · ${PRODUCT_NAME}`,
  description: `How to cancel a ${PRODUCT_NAME} subscription, what happens to your plan when you do, and when a payment is refunded.`,
  alternates: { canonical: "/refund-policy" },
};

/**
 * Mirrors src/lib/billing/service.ts: cancellation is cancel_at_cycle_end on
 * the Razorpay subscription, plan changes are scheduled for the cycle end with
 * no proration, and an ended subscription falls back to the Free plan. Keep the
 * two in step if billing semantics change.
 */
export default function RefundPolicyPage() {
  const { supportEmail } = getServerEnv();
  const grievance = grievanceOfficerContact(supportEmail);
  return (
    <PublicPage
      currentPath="/refund-policy"
      title="Refund and cancellation policy"
      intro={`This policy explains how cancellation works for ${PRODUCT_NAME} subscriptions and when we refund a payment. ${legalOperatorStatement()}`}
    >
      <h2>Free plan</h2>
      <p>The Free plan costs nothing and needs no payment details, so there is nothing to cancel or refund. You can try every core feature on it before you pay.</p>
      <h2>Cancelling a paid plan</h2>
      <p>The workspace owner can cancel at any time in Settings under Billing. Cancellation takes effect at the end of the billing period you have already paid for: the plan and its limits stay active until then, no further renewal is charged, and the workspace then moves to the Free plan. Your workspace and its settings are kept, and the Free plan&#8217;s limits apply from then on.</p>
      <p>There is no cancellation fee. You can also cancel the payment mandate directly with your bank or UPI app, but cancelling in {PRODUCT_NAME} is the clearest way to make sure the workspace moves to Free on the right date.</p>
      <h2>Changing plans</h2>
      <p>Upgrades and downgrades are scheduled for the start of your next billing period. The current period is not prorated, and no partial refund or extra charge is made for the days left in it.</p>
      <h2>When we refund</h2>
      <p>Subscription payments are for a billing period that starts when the payment is taken, so a payment for a period that has started is not refunded, including for monthly and annual plans that are cancelled part way through. We do refund in full:</p>
      <ul>
        <li>a duplicate charge for the same billing period;</li>
        <li>a renewal charged after a cancellation had already taken effect;</li>
        <li>a payment taken for a plan that we could not activate on your workspace; and</li>
        <li>any other case where applicable consumer protection law requires a refund.</li>
      </ul>
      <p>We do not refund the remainder of a billing period when an account is closed for breaching the <Link href="/acceptable-use">acceptable use policy</Link>.</p>
      <h2>How to ask for a refund</h2>
      <p>Email <a href={`mailto:${supportEmail}?subject=${PRODUCT_NAME}%20refund%20request`}>{supportEmail}</a> from the workspace owner&#8217;s address within 30 days of the charge. Include the workspace name, the date and amount of the charge, and the Razorpay payment ID from your receipt. We acknowledge requests within two business days.</p>
      <p>Approved refunds are issued through Razorpay to the original payment method. Razorpay and your bank usually take five to seven business days to show the credit.</p>
      <h2>Complaints</h2>
      <p>If you are not satisfied with how a cancellation or refund request was handled, write to our grievance officer, {grievance.name}, at <a href={`mailto:${grievance.email}`}>{grievance.email}</a>. The process is described in the <Link href="/terms">terms of service</Link>, and our full details are on the <Link href="/contact">contact page</Link>.</p>
    </PublicPage>
  );
}
