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
    title: "Reply when a comment includes chosen words",
    description: "When a Page comment contains a word you chose, Linkar posts your public reply.",
    name: "Reply when a comment includes chosen words",
    trigger: { type: "comment", match: "keyword", keywords: ["details", "price"], mediaIds: [] },
    reply: "Thanks for asking! We’ll share the details here shortly.",
    popular: true,
  }),
  pageTemplate({
    id: "facebook-every-comment-reply",
    title: "Reply to every comment",
    description: "When someone leaves a new comment on your Page, Linkar posts one public reply.",
    name: "Reply to every comment",
    trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
    reply: "Thanks for your comment! We appreciate you joining the conversation.",
    popular: true,
  }),
  pageTemplate({
    id: "facebook-product-pricing-faq",
    title: "Answer product and price questions",
    description: "Answer common product and pricing questions directly under the comment.",
    name: "Answer product and price questions",
    trigger: { type: "comment", match: "keyword", keywords: ["price", "cost", "details"], mediaIds: [] },
    reply: "Thanks for asking! Current product and pricing details are available from our team.",
  }),
  pageTemplate({
    id: "facebook-availability-hours",
    title: "Answer questions about hours",
    description: "Give visitors a quick public acknowledgement when they ask about availability or hours.",
    name: "Answer questions about hours",
    trigger: { type: "comment", match: "keyword", keywords: ["available", "hours", "open"], mediaIds: [] },
    reply: "Thanks for checking! We’ll confirm the latest availability and hours for you.",
  }),
  pageTemplate({
    id: "facebook-giveaway-acknowledgement",
    title: "Confirm giveaway comments",
    description: "When someone comments your giveaway word, Linkar publicly confirms that it was seen.",
    name: "Confirm giveaway comments",
    trigger: { type: "comment", match: "keyword", keywords: ["enter", "giveaway"], mediaIds: [] },
    reply: "Entry noted—thanks for taking part! Please check the post for the full rules.",
  }),
  pageTemplate({
    id: "facebook-support-acknowledgement",
    title: "Confirm that a support question was seen",
    description: "When someone asks for help in a comment, Linkar lets them know your team has seen it.",
    name: "Confirm that a support question was seen",
    trigger: { type: "comment", match: "keyword", keywords: ["help", "support", "issue"], mediaIds: [] },
    reply: "Thanks for flagging this. Our support team has seen your comment and will help.",
  }),
  pageTemplate({
    id: "facebook-per-post-campaign-reply",
    title: "Reply only on selected posts",
    description: "Choose the Facebook Page posts where Linkar should post this public reply.",
    name: "Reply only on selected posts",
    trigger: { type: "comment", match: "keyword", keywords: ["campaign"], mediaIds: [] },
    reply: "Thanks for joining this campaign! Your comment has been received.",
  }),
];
