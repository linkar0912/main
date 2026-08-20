import { PublicPage } from "@/src/components/public-page";

export default function TermsPage() {
  return (
    <PublicPage title="Terms of service" intro="These terms govern your use of DMSetu, the Instagram automation workspace operated by the DMSetu team.">
      <h2>Using DMSetu</h2>
      <p>You may use DMSetu only if you can legally enter this agreement and you have the right to connect the Instagram account and content you provide. You are responsible for your workspace, your saved automations, and the messages those automations send.</p>
      <h2>Rules and compliance</h2>
      <p>You must follow Meta’s terms, Instagram’s rules, applicable privacy and marketing laws, and any consent requirements that apply to your audience. Do not use DMSetu for spam, harassment, impersonation, unlawful content, scraping, credential collection, or automated actions outside the official APIs.</p>
      <h2>Automations</h2>
      <p>DMSetu evaluates deterministic rules that you configure. We do not guarantee delivery, reach, timing, or availability because Meta controls API access, rate limits, policy enforcement, and the recipient’s experience. Review every message and link before activating a flow.</p>
      <h2>Third-party services</h2>
      <p>Instagram and Meta are third-party services. Your use of them remains subject to their terms and policies. DMSetu is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.</p>
      <h2>Availability and changes</h2>
      <p>We may improve, suspend, or discontinue parts of the service, including when a provider changes an API or access requirement. We will try to communicate material changes and keep the public support surfaces current.</p>
      <h2>Contact</h2>
      <p>For questions or account concerns, contact <a href="mailto:support@dmsetu.app">support@dmsetu.app</a>.</p>
    </PublicPage>
  );
}
