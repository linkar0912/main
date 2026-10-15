import { faqItems } from "@/src/components/marketing/marketing-content";
import { getSeoPages, SEO_CONTENT_UPDATED, seoCollections, seoPagePath, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { LEGAL_ENTITY } from "@/src/lib/legal-entity";
import { MARKETING_PAGES_UPDATED } from "@/src/lib/seo-pages";
import { MARKETING_HOST } from "@/src/lib/site-routing";
import { publicSiteOrigin } from "@/src/lib/site-url";

function rupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/** "A, B and C". */
function listed(items: readonly string[]): string {
  return items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items.join("");
}

/** What kind of page each collection holds, for the guide lines. */
const GUIDE_KINDS: Record<SeoCollection, string> = {
  features: "Feature guide",
  solutions: "Solution guide",
  templates: "Workflow recipe",
};

/**
 * A guide line says what the page holds, built from the page's own steps and
 * question, rather than repeating its meta description and call to action.
 */
function guideLine(origin: string, page: SeoPage): string {
  const steps = page.steps.map(([title]) => title).join("; ");
  return `- [${page.label}](${origin}${seoPagePath(page)}): ${GUIDE_KINDS[page.collection]} with setup steps (${steps}), an example conversation and the question "${page.faq[0]}"`;
}

/**
 * Facts AI answers ask Indian buyers about. Prices and limits come from the
 * billing catalog; the wording follows /pricing (payments, deliveries, the
 * limit, cancelling, the card question) and /terms (GST, Meta).
 */
function facts(origin: string): string[] {
  const paid = Object.values(BILLING_PLANS);
  const lastUpdated = [SEO_CONTENT_UPDATED, MARKETING_PAGES_UPDATED].sort().at(-1);
  return [
    "Prices are in Indian rupees and include applicable GST.",
    "Paid plans are billed through Razorpay. Pay with UPI, cards or netbanking; each payment comes with a tax invoice.",
    `Paid plans renew monthly or yearly. Yearly prices: ${listed(paid.map((plan) => `${plan.name} ${rupees(plan.annualPaise)}`))} a year.`,
    `The ${FREE_BILLING_PLAN.name} plan costs ${rupees(FREE_BILLING_PLAN.monthlyPaise)} and needs no card or billing details.`,
    `Usage is counted in outbound messages, which the pricing page calls deliveries: every comment reply, direct message, sequence step and broadcast message ${PRODUCT_NAME} sends counts once. Incoming comments, DMs and Story replies are free.`,
    "At the monthly limit, automations stop sending and report the limit. Nothing is charged beyond the plan, and moving up a plan resumes sending.",
    "Usage resets on the 1st of each calendar month, in UTC.",
    `Cancel any time. The plan stays active until the end of the period already paid for, then the workspace moves to ${FREE_BILLING_PLAN.name}. There is no exit fee.`,
    "Works with Instagram professional accounts (Business or Creator) and Facebook Pages, through Meta's official APIs. Personal Instagram accounts are not supported.",
    `${PRODUCT_NAME} is not affiliated with, endorsed by, or sponsored by Meta Platforms, Inc.`,
    `Support: ${LEGAL_ENTITY.supportEmail}, or see the [contact page](${origin}/contact).`,
    `Last updated: ${lastUpdated}`,
  ].map((fact) => `- ${fact}`);
}

/**
 * /llms.txt (llmstxt.org): a plain-Markdown summary of the public site for AI
 * search tools. Prices, answers and guides come from the same sources as the
 * pages, so a new guide is listed here as soon as it is published.
 */
export function GET() {
  const origin = publicSiteOrigin();
  const plans = [FREE_BILLING_PLAN, ...Object.values(BILLING_PLANS)]
    .map((plan) => {
      const price = plan.annualPaise > 0 ? `${rupees(plan.monthlyPaise)} a month or ${rupees(plan.annualPaise)} a year` : `${rupees(plan.monthlyPaise)} a month`;
      return `- ${plan.name}: ${price}, ${plan.automationLimit} automations, ${plan.monthlyDeliveryLimit.toLocaleString("en-IN")} outbound messages a month`;
    })
    .join("\n");
  const faq = faqItems.map((item) => `### ${item.question}\n\n${item.answer}`).join("\n\n");
  const guides = (Object.keys(seoCollections) as SeoCollection[]).map((collection) => [
    `### ${seoCollections[collection].label}`,
    getSeoPages(collection).map((page) => guideLine(origin, page)).join("\n"),
  ].join("\n\n")).join("\n\n");
  const recipes = getSeoPages("templates")
    .map((page) => `- [${page.label}, Markdown plan](${origin}${seoPagePath(page)}/recipe): the channel, setup steps, sample request and reply, and testing notes as plain text`)
    .join("\n");

  const body = `# ${PRODUCT_NAME}

> ${PRODUCT_NAME} (${MARKETING_HOST}) is Instagram automation software for creators and brands in India. It auto-replies to comments, DMs and Story mentions through Meta's official Instagram API: it can send an auto DM to anyone who comments a chosen keyword, share links, ask questions and hand conversations to your team. It can also post public replies to Facebook Page comments.

${PRODUCT_NAME} is spelled L-I-N-K-A-R. It is a separate product from DM Linkr, Linkr and LinkDM.

## Facts

${facts(origin).join("\n")}

## Pages

- [Home](${origin}/): what ${PRODUCT_NAME} does and how it works
- [Pricing](${origin}/pricing): plans in Indian rupees, what counts as a delivery, and checkout
- [${seoCollections.features.label}](${origin}/features): Instagram workflows and Facebook Page public comment replies
- [${seoCollections.solutions.label}](${origin}/solutions): practical workflows for creators and businesses
- [${seoCollections.templates.label}](${origin}/templates): sample messages, setup steps, and downloadable campaign plans
- [Support](${origin}/support): help with connecting accounts and testing automations
- [Contact](${origin}/contact): who operates ${PRODUCT_NAME}, support, billing and grievance contacts
- [Refund and cancellation policy](${origin}/refund-policy)
- [Privacy policy](${origin}/privacy)
- [Terms of service](${origin}/terms)

## Guides

${guides}

## Plans

Prices include applicable GST. Full limits are on the [pricing page](${origin}/pricing).

${plans}

## Questions

From the [homepage FAQ](${origin}/#faq).

${faq}

## Optional

${recipes}
`;

  return new Response(body, { headers: { "content-type": "text/markdown; charset=utf-8" } });
}
