import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/src/components/public-page";
import { LegalEntityDetails } from "@/src/components/marketing/legal-entity-details";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { LEGAL_ENTITY, grievanceOfficerContact, legalJurisdiction, legalOperatorStatement } from "@/src/lib/legal-entity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Terms of service · ${PRODUCT_NAME}`,
  description: `The terms that govern your use of ${PRODUCT_NAME}, including subscriptions, renewals, cancellation, liability, governing law, and grievance redressal.`,
  alternates: { canonical: "/terms" },
};

export default function TermsPage() {
  const { supportEmail } = getServerEnv();
  const grievance = grievanceOfficerContact(supportEmail);
  return (
    <PublicPage currentPath="/terms" title="Terms of service" intro={`These terms govern your use of ${PRODUCT_NAME}, the Instagram and Facebook Page automation workspace. ${legalOperatorStatement()} In these terms, "we" and "us" mean that operator.`}>
      <h2>Who we are</h2>
      <p>{legalOperatorStatement()} When you create an account or buy a plan, your agreement is with the proprietor of {LEGAL_ENTITY.tradeName}.</p>
      <LegalEntityDetails supportEmail={supportEmail} />
      <h2>Using {PRODUCT_NAME}</h2>
      <p>You may use {PRODUCT_NAME} only if you can legally enter this agreement and you have the right to connect each Instagram account or Facebook Page and its content. You are responsible for your workspace, saved automations, and the replies those automations send.</p>
      <h2>Rules and compliance</h2>
      <p>You must follow Meta’s terms, Instagram’s and Facebook’s rules, applicable privacy and marketing laws, and any consent requirements that apply to your audience. Do not use {PRODUCT_NAME} for spam, harassment, impersonation, unlawful content, scraping, credential collection, or automated actions outside the official APIs. The <Link href="/acceptable-use">acceptable use policy</Link> forms part of these terms.</p>
      <h2>Automations</h2>
      <p>{PRODUCT_NAME} evaluates deterministic rules that you configure. We do not guarantee delivery, reach, timing, or availability because Meta controls API access, rate limits, policy enforcement, and the experience of the person receiving a reply. Review every message and link before activating a flow.</p>
      <h2>Plans, subscriptions, and auto-renewal</h2>
      <p>The Free plan costs nothing and needs no payment details. Paid plans are sold as monthly or annual subscriptions in Indian rupees at the prices on the <Link href="/pricing">pricing page</Link>, which include applicable GST. Payments are collected by Razorpay; we never receive or store your card number.</p>
      <p>A paid subscription renews automatically at the end of each billing period, for the same plan and billing interval, and the renewal is charged to the payment method you authorised at checkout. It keeps renewing until you cancel it. You can see your current plan and next renewal in Settings under Billing.</p>
      <p>If you change plans, the change is scheduled with Razorpay and takes effect at the start of your next billing period; the current period is not prorated. If we change the price of a plan, we will tell account owners by email before it applies, and the new price takes effect only from a renewal after that notice.</p>
      <p>Each plan has monthly limits on deliveries and other usage. When a limit is reached, automations stop sending until the next calendar month or until you move to a larger plan. We never charge for usage beyond your plan.</p>
      <h2>Refunds and cancellation</h2>
      <p>You can cancel a paid subscription at any time in Settings under Billing. Cancellation stops the next renewal: your plan stays active until the end of the period you have already paid for, and the workspace then moves to the Free plan. Payments for a period that has started are not refunded, except where the <Link href="/refund-policy">refund and cancellation policy</Link> says otherwise or the law requires it.</p>
      <h2>Suspension and termination</h2>
      <p>You may stop using {PRODUCT_NAME} and close your account at any time. We may suspend or terminate a workspace that breaches these terms or the acceptable use policy, that puts other customers or the connected platforms at risk, or where the law requires it. Where the breach is not serious, we will tell you what we found and give you a reasonable chance to fix it first.</p>
      <p>When an account is closed, automations stop and connected channels are disconnected. We delete account data as described in the <Link href="/privacy">privacy policy</Link>, except where the law requires us to keep records such as tax invoices.</p>
      <h2>Third-party services</h2>
      <p>Instagram, Facebook, and Meta are third-party services. Your use of them remains subject to their terms and policies. {PRODUCT_NAME} is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.</p>
      <h2>Disclaimers and limitation of liability</h2>
      <p>{PRODUCT_NAME} is provided on an &#8220;as is&#8221; and &#8220;as available&#8221; basis. To the extent the law allows, we disclaim implied warranties of merchantability, fitness for a particular purpose, and uninterrupted or error-free operation.</p>
      <p>To the extent the law allows, we are not liable for indirect, incidental, special, or consequential losses, or for lost profits, revenue, followers, or goodwill, arising from your use of {PRODUCT_NAME} or from actions taken by Meta or another platform. Our total liability for any claim arising from these terms or the service is limited to the amount you paid us for the service in the twelve months before the event that gave rise to the claim. Nothing in these terms limits liability that cannot be limited under applicable law, including your rights as a consumer.</p>
      <h2>Availability and changes</h2>
      <p>We may improve, suspend, or discontinue parts of the service, including when a provider changes an API or access requirement. We may update these terms; material changes are announced to account owners by email before they apply, and the effective date above always shows the version in force.</p>
      <h2>Governing law and jurisdiction</h2>
      <p>These terms are governed by the laws of {LEGAL_ENTITY.governingLaw}. Subject to any rights you have under consumer protection law to bring a complaint where you live, disputes arising from these terms or the service are subject to the exclusive jurisdiction of {legalJurisdiction()}.</p>
      <h2>Grievance redressal</h2>
      <p>If you have a complaint about the service, billing, or how we handle your personal data, write to our grievance officer, {grievance.name}, at <a href={`mailto:${grievance.email}`}>{grievance.email}</a>. We acknowledge every complaint within 48 hours and aim to resolve it within one month of receiving it. You can find our full contact details on the <Link href="/contact">contact page</Link>.</p>
      <h2>Contact</h2>
      <p>For questions or account concerns, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
