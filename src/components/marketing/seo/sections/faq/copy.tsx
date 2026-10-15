import Link from "next/link";
import type { ReactNode } from "react";
import { seoPages, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";

export type FaqItem = readonly [question: string, answer: ReactNode];

export const faqTitle = "Questions, answered.";

/** The columns variant's sub line under the title. */
export const faqSub = "Short answers about accounts, plans and setup. If your question is not covered here, our support team can help.";

/** Where to go when the answers are not enough: both routes are already linked from the answers. */
export const faqHelp = {
  lead: "Still have a question?",
  links: [
    { label: "Contact support", href: "/support" },
    { label: "Compare plans", href: "/pricing" },
  ],
} as const;

/** What a Facebook Page guide calls itself in the account answer: only a template is a recipe. */
const facebookGuideIntro: Record<SeoCollection, string> = {
  features: "This feature uses",
  solutions: "This guide uses",
  templates: "This recipe uses",
};

/** The three questions any page can answer after its own. Answers and links are fixed copy. */
export function genericQuestions(page: SeoPage): readonly FaqItem[] {
  const freeLimits = `${FREE_BILLING_PLAN.automationLimit} automations and ${FREE_BILLING_PLAN.monthlyDeliveryLimit.toLocaleString("en-IN")} messages per month`;
  return [
    ["Which account do I need?", page.topic === "facebook"
      ? `Connect a Facebook Page you are authorised to manage. ${facebookGuideIntro[page.collection]} supported public Page comment replies. Check the capabilities and permissions shown for the connected Page before publishing.`
      : "Connect an Instagram professional account, either Business or Creator. Check the capabilities available to that account and use a supported incoming interaction. Personal Instagram accounts are not supported for these automation journeys."],
    ["Can I try Linkar for free?", <>Yes. Start with {freeLimits} on the free plan. Features and limits depend on the plan and connected account. <Link href="/pricing">Compare the current plans</Link> before choosing a larger setup.</>],
    ["Do I need to write code?", <>No. Use Linkar’s supported builder options to choose the interaction, write your messages, and configure the next steps. Supply your own destinations and test the full journey. If you need help with an account or delivery issue, <Link href="/support">contact support</Link>.</>],
  ];
}

/**
 * The one generic question this page answers. Picked by the page's place in
 * seoPages, so it never changes between builds and each answer appears on
 * about a third of the pages instead of every one.
 */
export function genericQuestion(page: SeoPage): FaqItem {
  const questions = genericQuestions(page);
  const index = seoPages.findIndex((candidate) => candidate.collection === page.collection && candidate.slug === page.slug);
  return questions[Math.max(0, index) % questions.length];
}

/** The page's own question first, then one generic question. */
export function faqItems(page: SeoPage): readonly FaqItem[] {
  return [page.faq, genericQuestion(page)];
}
