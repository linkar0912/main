import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export default function DataDeletionPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage title="Data deletion" intro={`You can ask ${PRODUCT_NAME} to delete the information associated with your Instagram account and workspace. We make deletion requests straightforward and do not require you to keep using the service.`}>
      <h2>Request deletion</h2>
      <p>Send an email to <a href={`mailto:${supportEmail}?subject=${PRODUCT_NAME}%20data%20deletion`}>{supportEmail}</a> from the workspace owner. Include the Instagram username, workspace name, and the email address associated with the account. Do not send an Instagram password or access token.</p>
      <h2>What we remove</h2>
      <p>We disconnect the Instagram account and delete the stored access token and connection record. We also delete or de-identify workspace automation and delivery records associated with the request where they are no longer required for security, fraud prevention, or legal obligations.</p>
      <h2>Meta callback</h2>
      <p>For Meta-initiated requests, {PRODUCT_NAME} accepts signed deletion requests at <code>/api/meta/data-deletion</code> and returns a confirmation code and this status page. Requests are verified with the Meta App Secret before they are processed.</p>
      <h2>Timing</h2>
      <p>We acknowledge requests within two business days and aim to complete them within thirty days. If law or a security investigation requires limited retention, we will explain what remains and why.</p>
      <h2>Questions</h2>
      <p>If you need the confirmation code for a previous request, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
