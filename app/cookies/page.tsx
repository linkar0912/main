import type { Metadata } from "next";
import { AnalyticsConsentControls } from "@/src/components/analytics-consent";
import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Cookies statement · ${PRODUCT_NAME}`,
  description: `The cookies ${PRODUCT_NAME} uses, who sets them, and how to accept or refuse analytics cookies.`,
  alternates: { canonical: "/cookies" },
};

export default function CookiesPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage
      currentPath="/cookies"
      title="Cookies statement"
      intro={`${PRODUCT_NAME} uses a small number of cookies and similar browser storage. This statement lists what they are for, who sets them, and how to refuse the ones that are not strictly necessary.`}
    >
      <h2>Strictly necessary</h2>
      <p>These keep you signed in and keep the service secure. They are set by {PRODUCT_NAME} and by Supabase, which provides our authentication. They hold your session and the tokens that prove a request came from you. The service cannot work without them, so they are not optional and no consent is sought for them.</p>
      <p>Your analytics choice is itself stored in a first-party cookie, <code>linkar_analytics_consent</code>, for one year, so we do not ask again on every visit. Your theme choice is stored in your browser&#8217;s local storage rather than a cookie, so the page does not flash white before dark mode applies. Neither leaves your device.</p>
      <h2>Analytics</h2>
      <p>We use Google Analytics 4 to understand which pages people use, but only if you accept analytics cookies. Until you choose, Google Analytics does not load, and if you reject it, it never does. Google Consent Mode is set to deny advertising storage and personalisation in every case, so even with your consent Google Analytics is used for measurement only.</p>
      <p>If you accept, Google sets cookies (<code>_ga</code> and <code>_ga_*</code>, kept for up to two years) that distinguish one visitor from another across pages and visits, and receives the page viewed, the referring page, device and browser details, and an approximate location derived from your IP address.</p>
      <p>Page addresses are shortened before they are sent. Any identifier in an address, such as a deletion request code or a workspace, is replaced with a placeholder, and query strings and fragments are removed. We do not send your name, email address, or connected account details to Google, and analytics activity is not linked to your {PRODUCT_NAME} account.</p>
      <h2>Your analytics choice</h2>
      <p>You can change your choice here at any time. Rejecting after you accepted stops analytics on this page straight away and removes the Google Analytics cookies we can reach.</p>
      <AnalyticsConsentControls />
      <h2>Payments</h2>
      <p>Checkout is handled by Razorpay. When you open the payment flow, Razorpay sets its own cookies to run the transaction and to detect fraud. These are governed by Razorpay&#8217;s own policies, not by ours. We never see or store your card details.</p>
      <h2>What we do not use</h2>
      <p>{PRODUCT_NAME} does not use advertising cookies, does not run retargeting pixels, and does not sell or share browsing activity with advertising networks.</p>
      <h2>Other ways to refuse cookies</h2>
      <p>You can also block or delete cookies in your browser settings. Refusing analytics and payment cookies does not affect any automation you have configured. Blocking the strictly necessary cookies will sign you out and prevent the app from working.</p>
      <p>Questions about this statement go to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
