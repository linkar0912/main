import { PublicPage } from "@/src/components/public-page";
import { getServerEnv } from "@/src/lib/env";
import { PRODUCT_NAME } from "@/src/lib/branding";

export const dynamic = "force-dynamic";

export default function TermsPage() {
  const { supportEmail } = getServerEnv();
  return (
    <PublicPage currentPath="/terms" title="Terms of service" intro={`These terms govern your use of ${PRODUCT_NAME}, the Instagram and Facebook Page automation workspace operated by the ${PRODUCT_NAME} team.`}>
      <h2>Using {PRODUCT_NAME}</h2>
      <p>You may use {PRODUCT_NAME} only if you can legally enter this agreement and you have the right to connect each Instagram account or Facebook Page and its content. You are responsible for your workspace, saved automations, and the replies those automations send.</p>
      <h2>Rules and compliance</h2>
      <p>You must follow Meta’s terms, Instagram’s and Facebook’s rules, applicable privacy and marketing laws, and any consent requirements that apply to your audience. Do not use {PRODUCT_NAME} for spam, harassment, impersonation, unlawful content, scraping, credential collection, or automated actions outside the official APIs.</p>
      <h2>Automations</h2>
      <p>{PRODUCT_NAME} evaluates deterministic rules that you configure. We do not guarantee delivery, reach, timing, or availability because Meta controls API access, rate limits, policy enforcement, and the recipient’s experience. Review every message and link before activating a flow.</p>
      <h2>Third-party services</h2>
      <p>Instagram, Facebook, and Meta are third-party services. Your use of them remains subject to their terms and policies. {PRODUCT_NAME} is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.</p>
      <h2>Availability and changes</h2>
      <p>We may improve, suspend, or discontinue parts of the service, including when a provider changes an API or access requirement. We will try to communicate material changes and keep the public support surfaces current.</p>
      <h2>Contact</h2>
      <p>For questions or account concerns, contact <a href={`mailto:${supportEmail}`}>{supportEmail}</a>.</p>
    </PublicPage>
  );
}
