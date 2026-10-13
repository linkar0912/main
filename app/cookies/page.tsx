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
      <p>We use Google Analytics 4 on our public website to see which pages people find useful: the home, pricing, legal, support and contact pages, and the sign-in and sign-up pages. It never runs inside the {PRODUCT_NAME} app or the owner console, so it never sees your workspace.</p>
      <p>If you are in the UK, the European Economic Area or Switzerland, analytics cookies stay off until you accept them in the notice at the bottom of the page. Everywhere else, including India, they are on by default and you can turn them off below at any time. Google Consent Mode denies advertising storage and personalisation for everyone, so Google Analytics is used for measurement only.</p>
      <p>When analytics cookies are on, Google sets <code>_ga</code> and <code>_ga_*</code>. They tell one visitor from another across pages and visits and are kept for up to two years. Google receives the page viewed, the page title, the referring page, device and browser details, and an approximate location derived from your IP address, and keeps this data for up to 14 months. Before you accept, Google may receive a signal that a page was viewed, with no cookie or identifier attached.</p>
      <p>Page addresses are shortened before they are sent: query strings and fragments are removed, so a code in a link, such as an invite code, never reaches Google. We do not send your name, email address, or connected account details to Google, and analytics activity is not linked to your {PRODUCT_NAME} account.</p>
      <h2>Your analytics choice</h2>
      <p>You can change your choice here at any time. Declining stops analytics on this page straight away, removes the Google Analytics cookies we can reach, and keeps Google Analytics from loading on later visits. You can also opt out of Google Analytics on every website with <a href="https://tools.google.com/dlpage/gaoptout">Google&#8217;s opt-out browser add-on</a>.</p>
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
