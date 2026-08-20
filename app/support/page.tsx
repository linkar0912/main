import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export default function SupportPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage title="Support" intro="Need help connecting Instagram, validating a rule, or preparing a Meta App Review submission? We’ll help you get to a reproducible test case.">
      <h2>Contact the team</h2>
      <p>Email <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your workspace name, Instagram username, the automation name, and the approximate time of the issue. Never include a password, access token, or signed request.</p>
      <h2>Connection checklist</h2>
      <ul><li>Use a professional Instagram account connected to a Facebook Page or Business account where required by Meta’s current product flow.</li><li>Configure the Meta App ID, App Secret, redirect URI, verify token, and a 32-byte token encryption key.</li><li>Use a public HTTPS URL for OAuth callbacks and webhook verification.</li><li>Subscribe the Instagram account to the comments and messages webhook fields requested by the app.</li></ul>
      <h2>What this MVP supports</h2>
      <p>{PRODUCT_NAME} supports deterministic keyword or any-comment/DM triggers, optional keyword or post conditions, private replies to comments, text DMs, link messages, and button messages through Meta’s official APIs. Follower-triggered DMs, scraping, WhatsApp, and AI-generated replies are not part of this MVP.</p>
      <h2>Review access</h2>
      <p>For Meta reviewers, provide a test Instagram account, the deployed app URL, the exact automation to test, and the steps: connect Instagram, create a rule, activate it, comment or send a DM, and observe the configured reply.</p>
    </PublicPage>
  );
}
