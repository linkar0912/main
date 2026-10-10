import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/src/components/public-page";
import { LegalEntityDetails } from "@/src/components/marketing/legal-entity-details";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { grievanceOfficerContact, legalOperatorStatement } from "@/src/lib/legal-entity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Contact · ${PRODUCT_NAME}`,
  description: `Who operates ${PRODUCT_NAME}, how to reach support, and how to raise a complaint with our grievance officer.`,
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const { supportEmail } = getServerEnv();
  const grievance = grievanceOfficerContact(supportEmail);
  return (
    <PublicPage title="Contact us" intro={`${legalOperatorStatement()} Here is how to reach us about your account, billing, or a complaint.`}>
      <h2>Business details</h2>
      <LegalEntityDetails supportEmail={supportEmail} />
      <h2>Support and billing</h2>
      <p>Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your workspace name and, for billing questions, the Razorpay payment ID from your receipt. We reply within two business days. For setup help, see the <Link href="/support">support page</Link>.</p>
      <h2>Grievance officer</h2>
      <p>Complaints about the service, billing, or how we handle personal data go to {grievance.name}, at <a href={`mailto:${grievance.email}`}>{grievance.email}</a>. We acknowledge every complaint within 48 hours and aim to resolve it within one month of receiving it.</p>
      <h2>Policies</h2>
      <p>Read the <Link href="/terms">terms of service</Link>, the <Link href="/refund-policy">refund and cancellation policy</Link>, and the <Link href="/privacy">privacy policy</Link>. To have your data deleted, follow the steps on the <Link href="/data-deletion">data deletion</Link> page.</p>
    </PublicPage>
  );
}
