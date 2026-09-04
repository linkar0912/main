import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export default function DataProcessingPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage
      currentPath="/data-processing"
      title="Data processing addendum"
      intro={`When you run automations, ${PRODUCT_NAME} handles personal data about the people who contact you. This addendum sets out how. It forms part of the terms of service and applies to every workspace, without needing to be signed separately.`}
    >
      <h2>Roles</h2>
      <p>For the conversations your automations handle, you are the controller and {PRODUCT_NAME} is the processor. You decide which rules run, what they say, and who receives them. We carry those instructions out.</p>
      <p>For your own account, for billing, and for site analytics, {PRODUCT_NAME} is the controller. Those uses are covered by the <a href="/privacy">privacy policy</a>.</p>
      <h2>What we process for you</h2>
      <p>Platform-scoped participant identifiers, the content of comments and messages your rules act on, media and comment identifiers, interaction and delivery timestamps, and follow-status results where a follow gate is configured. We do not receive email addresses or phone numbers for these participants unless someone types one into a conversation.</p>
      <h2>Our obligations</h2>
      <p>We process this data only to provide the service and only on your documented instructions, which are the automations you configure and the settings you choose. We do not use it for our own purposes, do not sell it, and do not use it to train models.</p>
      <p>People with access to it are bound by confidentiality. Access tokens are encrypted at rest, webhook signatures are verified before processing, and event identifiers are deduplicated so a replayed event cannot cause a second delivery.</p>
      <h2>Sub-processors</h2>
      <p>You authorise the providers listed on the <a href="/service-providers">service providers</a> page. Each is bound to terms no less protective than these. We update that page before a new provider starts, and you may object to an addition by writing to us; if we cannot resolve the objection you may terminate the affected service.</p>
      <h2>Helping you meet your obligations</h2>
      <p>If someone asks you for access to, correction of, or deletion of their data, we will help you answer within a reasonable time. You can disconnect a channel or request deletion at <a href="/data-deletion">/data-deletion</a>.</p>
      <p>We will tell you without undue delay after becoming aware of a personal data breach affecting data we process for you, with the detail you need to meet your own notification duties.</p>
      <h2>Retention and return</h2>
      <p>Participant records for comment-to-message automations are deleted automatically 90 days after their automation finishes or after the messaging window closes without a reply. When your account closes, we delete or return the data we hold for you, except where law requires us to keep it.</p>
      <h2>Audits</h2>
      <p>On reasonable written request, and no more than once a year unless a regulator requires otherwise, we will provide the information needed to demonstrate compliance with this addendum.</p>
      <h2>Contact</h2>
      <p>Data protection questions go to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
