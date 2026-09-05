import type { PremadeTemplate } from "../templates";
import type { FlowDefinitionV1 } from "../types";

function pageTemplate(input: {
  id: string;
  title: string;
  description: string;
  name: string;
  trigger: Extract<FlowDefinitionV1["trigger"], { type: "comment" }>;
  reply: string;
  popular?: boolean;
}): PremadeTemplate {
  return {
    id: input.id,
    title: input.title,
    description: input.description,
    howItWorks: [
      input.trigger.match === "any" ? "Someone comments on your Facebook Page." : "Someone comments using a word you choose.",
      "Linkar posts the public reply you saved.",
    ],
    icon: "reply",
    popular: input.popular,
    provider: "FACEBOOK",
    surface: "COMMENT",
    requiredCapabilities: ["facebook-page-comment"],
    setup: {
      name: input.name,
      definition: {
        version: 1,
        trigger: input.trigger,
        conditions: [],
        actions: [{ type: "private_reply", text: input.reply }],
      },
    },
  };
}

export const facebookPageAutomationTemplates: PremadeTemplate[] = [
  pageTemplate({
    id: "facebook-keyword-comment-reply",
    title: "Keyword comment reply",
    description: "Reply publicly when a Page comment contains one of your chosen keywords.",
    name: "Facebook keyword comment reply",
    trigger: { type: "comment", match: "keyword", keywords: ["details", "price"], mediaIds: [] },
    reply: "Thanks for asking! We’ll share the details here shortly.",
    popular: true,
  }),
  pageTemplate({
    id: "facebook-every-comment-reply",
    title: "Reply to every comment",
    description: "Acknowledge every new top-level visitor comment with one public Page reply.",
    name: "Reply to every Facebook comment",
    trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
    reply: "Thanks for your comment! We appreciate you joining the conversation.",
    popular: true,
  }),
  pageTemplate({
    id: "facebook-product-pricing-faq",
    title: "Product or pricing FAQ",
    description: "Answer common product and pricing questions directly under the comment.",
    name: "Facebook product and pricing FAQ",
    trigger: { type: "comment", match: "keyword", keywords: ["price", "cost", "details"], mediaIds: [] },
    reply: "Thanks for asking! Current product and pricing details are available from our team.",
  }),
  pageTemplate({
    id: "facebook-availability-hours",
    title: "Availability or opening hours",
    description: "Give visitors a quick public acknowledgement when they ask about availability or hours.",
    name: "Facebook availability and hours reply",
    trigger: { type: "comment", match: "keyword", keywords: ["available", "hours", "open"], mediaIds: [] },
    reply: "Thanks for checking! We’ll confirm the latest availability and hours for you.",
  }),
  pageTemplate({
    id: "facebook-giveaway-acknowledgement",
    title: "Giveaway acknowledgement",
    description: "Publicly confirm that a giveaway comment has been seen without sending a private message.",
    name: "Facebook giveaway acknowledgement",
    trigger: { type: "comment", match: "keyword", keywords: ["enter", "giveaway"], mediaIds: [] },
    reply: "Entry noted—thanks for taking part! Please check the post for the full rules.",
  }),
  pageTemplate({
    id: "facebook-support-acknowledgement",
    title: "Support acknowledgement",
    description: "Let visitors know their public support question has been noticed.",
    name: "Facebook support acknowledgement",
    trigger: { type: "comment", match: "keyword", keywords: ["help", "support", "issue"], mediaIds: [] },
    reply: "Thanks for flagging this. Our support team has seen your comment and will help.",
  }),
  pageTemplate({
    id: "facebook-per-post-campaign-reply",
    title: "Per-post campaign reply",
    description: "Scope a public acknowledgement to selected Facebook Page posts.",
    name: "Facebook per-post campaign reply",
    trigger: { type: "comment", match: "keyword", keywords: ["campaign"], mediaIds: [] },
    reply: "Thanks for joining this campaign! Your comment has been received.",
  }),
];
