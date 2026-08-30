import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export default function DataDeletionPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage currentPath="/data-deletion" title="Data deletion" intro={`You can ask ${PRODUCT_NAME} to delete information associated with your Instagram account, Facebook Page, and workspace. We make deletion requests straightforward and do not require you to keep using the service.`}>
      <h2>Request deletion</h2>
      <p>Send an email to <a href={`mailto:${supportEmail}?subject=${PRODUCT_NAME}%20data%20deletion`}>{supportEmail}</a> from the workspace owner. Include the Instagram username or Facebook Page name, workspace name, and account email. Do not send a password or access token.</p>
      <h2>What we remove</h2>
      <p>For a verified Meta callback, we delete the matching Instagram or Facebook connection, encrypted access token, associated automations, delivery records, webhook events, and queued delivery payloads. We retain the owner login email until the owner account is separately closed, plus a random confirmation code, request timestamps, completion status, and a one-way hash used only to make callback retries idempotent.</p>
      <h2>Meta callback</h2>
      <p>For Meta-initiated requests, {PRODUCT_NAME} accepts signed Instagram requests at <code>/api/meta/data-deletion</code> and Facebook requests at <code>/api/facebook/data-deletion</code>. Each returns a confirmation code with a dedicated status URL and is verified with the matching app secret.</p>
      <h2>Timing</h2>
      <p>We acknowledge requests within two business days and aim to complete them within thirty days. If law or a security investigation requires limited retention, we will explain what remains and why.</p>
      <h2>Questions</h2>
      <p>Keep the confirmation code returned with the request. If you need help with an owner-initiated request, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
