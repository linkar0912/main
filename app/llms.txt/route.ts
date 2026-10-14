import { faqItems } from "@/src/components/marketing/marketing-content";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { publicSiteOrigin } from "@/src/lib/site-url";

/**
 * /llms.txt (llmstxt.org): a plain-Markdown summary of the public site for AI
 * search tools. Prices and answers come from the same sources as the pages.
 */
export function GET() {
  const origin = publicSiteOrigin();
  const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)]
    .map((plan) => `- ${plan.name}: ₹${(plan.monthlyPaise / 100).toLocaleString("en-IN")} a month, ${plan.automationLimit} automations, ${plan.monthlyDeliveryLimit.toLocaleString("en-IN")} messages a month`)
    .join("\n");
  const faq = faqItems.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n");

  const body = `# ${PRODUCT_NAME}

> ${PRODUCT_NAME} is Instagram comment and DM automation for creators and brands in India. It auto-replies to comments, DMs and Story mentions through Meta's official Instagram API, sends links, asks questions, and hands conversations to your team.

## Pages

- [Home](${origin}/): what ${PRODUCT_NAME} does and how it works
- [Pricing](${origin}/pricing): plans in Indian rupees
- [Features](${origin}/features): Instagram workflows and Facebook Page public comment replies
- [Solutions](${origin}/solutions): practical workflows for creators and businesses
- [Workflow recipes](${origin}/templates): sample messages, setup steps, and downloadable campaign plans
- [Support](${origin}/support): help and contact
- [Privacy policy](${origin}/privacy)
- [Terms of service](${origin}/terms)

## Plans

${plans}

## Questions

${faq}
`;

  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
