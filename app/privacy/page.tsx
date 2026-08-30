import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage currentPath="/privacy" title="Privacy policy" intro={`${PRODUCT_NAME} helps creators and businesses automate Instagram conversations and public Facebook Page comment replies. This policy explains what we collect, why we use it, and how you can ask us to delete it.`}>
      <h2>Information we receive</h2>
      <p>When you connect an Instagram professional account, we receive the account identifier, username where available, access token, and the Instagram comments, messages, media identifiers, and delivery events needed to run the rules you create. We also receive your workspace details and support messages.</p>
      <p>When you connect a Facebook Page, we receive the Page identifier, Page name, encrypted Page access token, Page posts and top-level comments needed to run public comment-reply rules, and delivery results. Linkar ignores Page-authored and nested comment events for automation execution.</p>
      <p>For comment-to-message automations, we store the Instagram-scoped participant identifier, source comment and media identifiers, interaction and delivery timestamps, and the latest follow-status result needed to enforce your configured follow gate and prevent duplicate delivery.</p>
      <h2>How we use information</h2>
      <p>We use this information to authenticate connected Instagram accounts and Facebook Pages, receive official Meta webhooks, evaluate your saved rules, send the replies you configured, prevent duplicate delivery, provide support, and keep the service secure. {PRODUCT_NAME} does not use AI-generated replies in this MVP.</p>
      <h2>Sharing and processors</h2>
      <p>We share information only with service providers needed to host the application and with Meta’s APIs when you ask {PRODUCT_NAME} to send or receive Instagram or Facebook Page data. We do not sell personal information or use connected social content for advertising.</p>
      <h2>Storage and security</h2>
      <p>Access tokens are encrypted at rest. Webhook signatures are verified before processing, and event identifiers are deduplicated. No online service can guarantee absolute security; please use a strong account and workspace password and report suspected misuse promptly.</p>
      <h2>Retention and deletion</h2>
      <p>We retain workspace configuration and delivery records for as long as needed to provide the service or meet legal obligations. Instagram comment-to-message participant records are automatically deleted 90 days after their automation finishes running or after their messaging window closes without a reply. You can disconnect an Instagram account or Facebook Page in the app or request deletion sooner at <a href="/data-deletion">/data-deletion</a>. Meta callbacks are handled at the channel-specific data-deletion endpoints.</p>
      <h2>Your choices</h2>
      <p>You can stop an automation, disconnect a channel, request access to information associated with your workspace, or request correction or deletion. Contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your workspace and connected Instagram username or Facebook Page name.</p>
      <h2>Changes</h2>
      <p>We may update this policy as {PRODUCT_NAME} changes. We will update the date above and, where appropriate, notify account owners of material changes.</p>
    </PublicPage>
  );
}
