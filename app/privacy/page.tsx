import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { grievanceOfficerContact, legalOperatorStatement } from "@/src/lib/legal-entity";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Privacy policy · ${PRODUCT_NAME}`,
  description: `What personal data ${PRODUCT_NAME} collects, why, who it is shared with, how long it is kept, and how to exercise your rights under India's DPDP Act.`,
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  const { supportEmail } = getServerEnv();
  const grievance = grievanceOfficerContact(supportEmail);
  return (
    <PublicPage currentPath="/privacy" title="Privacy policy" intro={`${PRODUCT_NAME} helps creators and businesses automate Instagram conversations and public Facebook Page comment replies. This policy explains what we collect, why we use it, who we share it with, and how you can exercise your rights over it.`}>
      <h2>Who is responsible</h2>
      <p>{legalOperatorStatement()} For your account, billing, and site analytics, the proprietor is the data fiduciary under India&#8217;s Digital Personal Data Protection Act, 2023 (the DPDP Act). For the conversations your automations handle, you decide what happens and we act on your instructions, as described in the <Link href="/data-processing">data processing addendum</Link>.</p>
      <h2>Account and sign-in information</h2>
      <p>When you create an account we receive your email address, your name if you give one, and a password that our authentication provider, Supabase, stores only in hashed form. If you sign in with Google, Google shares your name, email address, and Google account identifier with us. If you sign in with Facebook, Facebook shares your name, email address, and public profile picture. We also record your workspace details, your role, sign-in times, and the support messages you send.</p>
      <p>When you invite a teammate, we store the email address you enter and send the invitation through our email provider, Resend. If the person does not accept, the invitation expires and is not used for anything else.</p>
      <h2>Billing information</h2>
      <p>Paid plans are billed through Razorpay. Razorpay receives your billing contact details and payment method directly when you check out, and returns to us the subscription and payment identifiers, plan, amount, status, and billing period. We never receive or store your card number, UPI PIN, or bank credentials. We keep invoices and payment records for as long as Indian tax law requires.</p>
      <h2>Connected Instagram and Facebook data</h2>
      <p>When you connect an Instagram professional account, we receive the account identifier, username where available, access token, and the Instagram comments, messages, media identifiers, and delivery events needed to run the rules you create.</p>
      <p>When you connect a Facebook Page, we receive the Page identifier, Page name, encrypted Page access token, Page posts and top-level comments needed to run public comment-reply rules, and delivery results. {PRODUCT_NAME} ignores Page-authored and nested comment events for automation execution.</p>
      <p>For comment-to-message automations, we store the Instagram-scoped participant identifier, source comment and media identifiers, interaction and delivery timestamps, and the latest follow-status result needed to enforce your configured follow gate and prevent duplicate delivery.</p>
      <h2>Tracked links</h2>
      <p>When someone opens a {PRODUCT_NAME} tracked link, we record the time, a one-way hash of their IP address (never the address itself), their browser&#8217;s user agent string, and the country our network provider derives from the request. The workspace that created the link sees these as click counts and country totals. If that workspace has set up a conversion address, we send it the link, the country, and the time of the click.</p>
      <h2>How we use information</h2>
      <p>We use this information to create and secure your account, authenticate connected Instagram accounts and Facebook Pages, receive official Meta events, evaluate your saved rules, send the replies you configured, prevent duplicate delivery, count usage against your plan, bill you, send service and security emails, provide support, and keep the service secure. {PRODUCT_NAME} does not use AI-generated replies in this MVP.</p>
      <p>We process account and billing data to perform our contract with you and to meet legal obligations, and we process analytics data only with your consent. We do not sell personal information or use connected social content for advertising.</p>
      <h2>Analytics and cookies</h2>
      <p>We use Google Analytics 4 to understand how the site and app are used, but only after you accept analytics cookies in the banner. Until you choose, Google Analytics does not load and no analytics cookies are set. When you accept, Google sets cookies that distinguish one visitor from another and receives the page you viewed, the page title, the referring page, your device and browser details, and an approximate location that Google derives from your IP address.</p>
      <p>Page addresses are shortened before they are sent. Where an address contains an identifier, such as a deletion request code, a workspace, or an automation, that part is replaced with a placeholder, and query strings and fragments are removed entirely. We do not send your name, email address, workspace, or connected account details to Google, and we do not link analytics activity to your {PRODUCT_NAME} account.</p>
      <p>You can change your choice at any time on the <Link href="/cookies">cookies statement</Link>. Refusing analytics does not affect any automation you have configured.</p>
      <h2>Sharing and service providers</h2>
      <p>We share information only with the service providers that run {PRODUCT_NAME}: Supabase for authentication and the database, our hosting and network providers, Resend for email, Razorpay for payments, Google for sign-in and analytics, and Meta&#8217;s APIs when you ask {PRODUCT_NAME} to send or receive Instagram or Facebook Page data. The full list, and what each one receives, is on the <Link href="/service-providers">service providers</Link> page. We may also disclose information where the law requires it.</p>
      <h2>Storage and security</h2>
      <p>Access tokens are encrypted at rest. Signed events from Meta are verified before processing, and event identifiers are deduplicated. Some providers process data outside India under the terms in their agreements with us. No online service can guarantee absolute security; please use a strong password and report suspected misuse promptly. If a personal data breach affects you, we will tell you and the Data Protection Board of India as the DPDP Act requires.</p>
      <h2>Retention and deletion</h2>
      <p>We keep account, workspace, and automation data while your account is open. Instagram comment-to-message participant records are automatically deleted 90 days after their automation finishes running or after their messaging window closes without a reply. Tracked-link click records are deleted with their link or workspace. When you close your account or ask us to delete it, we delete your personal data within thirty days, except for billing records we must keep under tax law and minimal records of the deletion request itself.</p>
      <p>You can disconnect an Instagram account or Facebook Page in the app or request deletion sooner at <Link href="/data-deletion">/data-deletion</Link>. Meta callbacks are handled at the channel-specific data-deletion endpoints.</p>
      <h2>Your rights</h2>
      <p>Under the DPDP Act you can ask us for a summary of the personal data we hold about you and how it is processed, ask us to correct, complete, update, or erase it, withdraw consent you have given (such as for analytics) as easily as you gave it, and nominate another person to exercise these rights if you die or become unable to. Contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a> with your account email, workspace, and connected Instagram username or Facebook Page name. We may need to verify your identity before acting on a request.</p>
      <p>{PRODUCT_NAME} is meant for businesses and creators and is not directed at children. Do not create an account if you are under 18.</p>
      <h2>Grievance officer</h2>
      <p>If you have a concern about how we handle your personal data, write to our grievance officer, {grievance.name}, at <a href={`mailto:${grievance.email}`}>{grievance.email}</a>. We acknowledge complaints within 48 hours and aim to resolve them within one month. If you are not satisfied with our response, you may complain to the Data Protection Board of India.</p>
      <h2>Changes</h2>
      <p>We may update this policy as {PRODUCT_NAME} changes. We will update the effective date above and, where appropriate, notify account owners of material changes.</p>
    </PublicPage>
  );
}
