import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export default function AcceptableUsePage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage
      currentPath="/acceptable-use"
      title="Acceptable use policy"
      intro={`${PRODUCT_NAME} sends messages in your name to real people on Instagram and Facebook. This policy sets the limits on what you may automate, and it applies to every workspace on every plan.`}
    >
      <h2>Rules you agree to</h2>
      <p>You may use {PRODUCT_NAME} only for conversations people have invited. That means replying to a comment they left, a message they sent, or a story they responded to. You may not use {PRODUCT_NAME} to contact people who have not interacted with your account.</p>
      <p>You are responsible for the content of every automated reply. {PRODUCT_NAME} sends what your rules tell it to send, so the words are yours and the obligations that come with them are yours.</p>
      <h2>What you may not send</h2>
      <p>Do not use {PRODUCT_NAME} to send unsolicited bulk messages, to impersonate another person or business, to promote illegal goods and services, to distribute malware or phishing links, or to harass, threaten, or abuse anyone.</p>
      <p>Do not use it for content that is unlawful where you or your audience are located, that infringes someone else&#8217;s intellectual property, that sexualises minors, or that Meta&#8217;s own platform policies prohibit.</p>
      <p>Do not send regulated financial, medical, or legal advice through an automation unless you are licensed to give it and your replies meet the disclosure rules that apply to you.</p>
      <h2>Platform rules come first</h2>
      <p>{PRODUCT_NAME} runs on Meta&#8217;s official APIs and stays inside the messaging windows and rate limits Meta sets. Meta&#8217;s Platform Terms and Community Standards apply to everything you send. Where this policy and Meta&#8217;s rules differ, the stricter rule applies. Meta can restrict or remove your account for policy breaches, and we cannot appeal that on your behalf.</p>
      <h2>Technical limits</h2>
      <p>Do not attempt to work around plan limits, rate limits, or the follow gate. Do not probe, scan, or load-test the service without written permission. Do not resell access, share credentials across organisations, or run the service on behalf of a third party except through a workspace they can see and control.</p>
      <h2>Reporting and enforcement</h2>
      <p>Report abuse to <a href={`mailto:${supportEmail}`}>{supportEmail}</a>. We investigate reports we receive and act on what we find.</p>
      <p>Where we believe a workspace breaches this policy, we may pause the affected automations, suspend the workspace, or close the account. Where the breach is serious, ongoing, or puts other customers or the connected platforms at risk, we may act without notice. Where it is not, we will tell you what we found and give you a chance to fix it.</p>
      <p>We do not refund the remainder of a billing period for an account closed under this policy.</p>
      <h2>Changes</h2>
      <p>We may update this policy as the service and the platform rules change. Material changes are announced to account owners, and the effective date above always shows the version in force.</p>
    </PublicPage>
  );
}
