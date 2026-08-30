import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export default function SupportPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage title="Support" intro="Need help connecting Instagram or a Facebook Page, validating a rule, or preparing a Meta App Review submission? We’ll help you get to a reproducible test case.">
      <h2>Contact the team</h2>
      <p>Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your workspace name, Instagram username or Facebook Page name, the automation name, and the approximate time of the issue. Never include a password, access token, or signed request.</p>
      <h2>Connection checklist</h2>
      <ul><li>For Instagram, use a professional account supported by Meta’s current Instagram Login flow.</li><li>For Facebook, connect a Page you are allowed to manage and approve the Page permissions requested by Linkar.</li><li>Configure each Meta app ID, app secret, redirect URI, verify token, and a 32-byte token encryption key.</li><li>Use public HTTPS URLs for OAuth callbacks and webhook verification.</li></ul>
      <h2>What this MVP supports</h2>
      <p>{PRODUCT_NAME} supports Instagram keyword or any-comment and DM triggers, private replies, messages, links, and buttons. Facebook Page automations support public replies to top-level comments only. Page-authored and nested Facebook comments are ignored. Scraping, WhatsApp, Facebook Messenger, and AI-generated replies are not part of this MVP.</p>
      <h2>Review access</h2>
      <p>For Meta reviewers, provide the appropriate Instagram test account or Facebook test Page, the deployed app URL, the exact automation to test, and channel-specific steps that end with the configured reply.</p>
    </PublicPage>
  );
}
