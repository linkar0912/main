import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

/**
 * The subprocessor list. Every entry here corresponds to a real integration in
 * the codebase - Meta in src/lib/meta, Razorpay in src/lib/billing, Supabase in
 * the auth layer, Google for sign-in and analytics. Add a row whenever a new
 * service starts handling customer data, and tell customers before it does.
 */
export default function ServiceProvidersPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage
      currentPath="/service-providers"
      title="Service providers"
      intro={`${PRODUCT_NAME} uses the providers below to run the service. Each one is contractually bound to process personal data only on our instructions. This page lists every provider that handles customer data, and we update it before a new one starts.`}
    >
      <h2>Platform APIs</h2>
      <p><strong>Meta Platforms.</strong> Instagram and Facebook Page conversations. Meta receives and returns the comments, messages, and delivery events your automations act on, and holds the accounts you connect. This is the platform you are automating, so its involvement is inherent to the service.</p>
      <h2>Infrastructure</h2>
      <p><strong>Supabase.</strong> Authentication and the managed Postgres database. Holds account records, workspace configuration, automation rules, encrypted channel tokens, and delivery history.</p>
      <p><strong>Application hosting.</strong> Runs the web application, the background workers, and the Redis queue that schedules deliveries. Processes all data in transit through the service.</p>
      <h2>Payments</h2>
      <p><strong>Razorpay.</strong> Subscriptions, checkout, and invoicing. Receives your billing contact details and payment instrument, and returns subscription status. {PRODUCT_NAME} never receives or stores card numbers.</p>
      <h2>Identity and analytics</h2>
      <p><strong>Google.</strong> Two separate uses. Google sign-in receives your email address and name when you choose to sign in with Google. Google Analytics receives shortened page addresses, device and browser details, and an approximate location, as described in the <a href="/cookies">cookies statement</a>. Analytics data is not linked to your account.</p>
      <h2>Where processing happens</h2>
      <p>These providers operate globally and may process data outside the country you are in. Where personal data moves across borders, it moves under the transfer terms in each provider&#8217;s own agreement with us.</p>
      <h2>Changes to this list</h2>
      <p>We will update this page before a new provider begins handling customer data. If you have a data processing agreement with us that requires advance notice of a change, that notice period applies and is served from this page and by email to account owners.</p>
      <p>Questions, and objections to a specific provider, go to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
