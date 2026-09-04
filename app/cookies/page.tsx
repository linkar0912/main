import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

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
      <p>Your theme choice is stored in your browser&#8217;s local storage rather than a cookie, so the page does not flash white before dark mode applies. It never leaves your device.</p>
      <h2>Analytics</h2>
      <p>We use Google Analytics to understand which pages people use. Google sets cookies that distinguish one visitor from another across pages and visits, and receives the page viewed, the referring page, device and browser details, and an approximate location derived from your IP address.</p>
      <p>Page addresses are shortened before they are sent. Any identifier in an address, such as a deletion request code or a workspace, is replaced with a placeholder, and query strings and fragments are removed. We do not send your name, email address, or connected account details to Google, and analytics activity is not linked to your {PRODUCT_NAME} account.</p>
      <h2>Payments</h2>
      <p>Checkout is handled by Razorpay. When you open the payment flow, Razorpay sets its own cookies to run the transaction and to detect fraud. These are governed by Razorpay&#8217;s own policies, not by ours. We never see or store your card details.</p>
      <h2>What we do not use</h2>
      <p>{PRODUCT_NAME} does not use advertising cookies, does not run retargeting pixels, and does not sell or share browsing activity with advertising networks.</p>
      <h2>Refusing cookies</h2>
      <p>You can block or delete cookies in your browser settings, and you can install Google&#8217;s opt-out browser add-on to stop analytics specifically. Refusing analytics and payment cookies does not affect any automation you have configured. Blocking the strictly necessary cookies will sign you out and prevent the app from working.</p>
      <p>Questions about this statement go to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
