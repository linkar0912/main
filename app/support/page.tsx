import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Support · ${PRODUCT_NAME}`,
  description: `Get help connecting Instagram or a Facebook Page to ${PRODUCT_NAME}, testing a rule, or preparing a Meta App Review submission.`,
  alternates: { canonical: "/support" },
};

export default function SupportPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage title="Support" intro="Need help connecting Instagram or a Facebook Page, checking why an automation did not reply, or preparing a Meta App Review submission? Tell us what happened and we will help you sort it out.">
      <h2>Contact the team</h2>
      <p>Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your workspace name, Instagram username or Facebook Page name, the automation name, and the approximate time of the issue. Never include a password, access token, or signed request.</p>
      <p>For billing questions, refunds, or complaints, see the <Link href="/contact">contact page</Link> and the <Link href="/refund-policy">refund and cancellation policy</Link>.</p>
      <h2>Connection checklist</h2>
      <ul><li>For Instagram, use a professional account supported by Meta.</li><li>For Facebook, connect a Page you are allowed to manage and approve the permissions {PRODUCT_NAME} requests.</li><li>If {PRODUCT_NAME} says setup is incomplete, ask your workspace administrator to check the Meta connection settings.</li><li>After connecting, Settings should show that the connection is ready.</li></ul>
      <h2>What Linkar can do today</h2>
      <p>{PRODUCT_NAME} can answer matching Instagram comments and messages with text, links, images, and buttons. For Facebook Pages, it can publicly answer new top-level comments. It does not reply to comments written by the Page or to replies nested under another comment. WhatsApp, Facebook Messenger, scraping, and AI-written replies are not currently included.</p>
      <h2>Review access</h2>
      <p>For Meta reviewers, provide the appropriate Instagram test account or Facebook test Page, the deployed app URL, the exact automation to test, and channel-specific steps that end with the configured reply.</p>
    </PublicPage>
  );
}
