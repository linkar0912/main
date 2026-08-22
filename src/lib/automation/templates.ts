import type { FlowDefinitionV1 } from "./types";

export type TemplateIllustration = "follow" | "faq" | "story" | "default" | "menu" | "email";

/**
 * A premade automation recipe shown in the Basic gallery. Every recipe is runnable on
 * the current engine and carries a builder prefill (`setup`) that is always a version-1
 * definition so the classic builder can open it directly.
 */
export type PremadeTemplate = {
  id: string;
  title: string;
  description: string;
  icon: "user-plus" | "message" | "at-sign" | "reply" | "menu" | "mail";
  illustration: TemplateIllustration;
  /** Prefill handed to the builder when the template is set up. */
  setup?: { name: string; definition: FlowDefinitionV1 };
};

export const basicAutomationTemplates: PremadeTemplate[] = [
  {
    id: "welcome-new-followers",
    title: "Say hi to new followers: first impressions are everything",
    description:
      "A one-time welcome DM for every new person who starts their first conversation with you. Meta’s API never exposes follows directly, so Linkar greets each first-time contact exactly once — no repeats, ever.",
    icon: "user-plus",
    illustration: "follow",
    setup: {
      name: "Welcome new contacts",
      definition: {
        version: 1,
        trigger: { type: "first_contact" },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Hi there 👋 Thanks for reaching out! I’m here whenever you need prices, hours, or anything else — just say the word.",
          },
        ],
      },
    },
  },
  {
    id: "conversation-starters",
    title: "Conversation Starters: help customers start a conversation with your business",
    description:
      "Creating a positive first impression is essential. When someone messages your Instagram account about prices, hours, or delivery, they instantly get a helpful reply with tappable buttons.",
    icon: "message",
    illustration: "faq",
    setup: {
      name: "Conversation starters",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["price", "hours", "delivery"] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Hey! 👋 Thanks for reaching out. Tap below for quick answers to the questions we hear most.",
          },
          {
            type: "send_button",
            text: "Pricing, working hours, and delivery details — all in one place.",
            buttonLabel: "See pricing & FAQs",
            url: "https://example.com/faqs",
          },
        ],
      },
    },
  },
  {
    id: "story-mention-reply",
    title: "Story Mention Reply: respond to users who mention you in their Story",
    description:
      "When followers mention your Instagram account in their Story, you can send a ‘Thank You’ message or start an automated conversation to engage and chat with customers at scale.",
    icon: "at-sign",
    illustration: "story",
    setup: {
      name: "Story mention reply",
      definition: {
        version: 1,
        trigger: { type: "story_mention" },
        conditions: [],
        actions: [
          { type: "send_text", text: "Thanks for mentioning us in your Story! 🧡 It means a lot." },
          {
            type: "send_button",
            text: "Here’s a little thank-you gift for you.",
            buttonLabel: "Claim your gift 🎁",
            url: "https://example.com/gift",
          },
        ],
      },
    },
  },
  {
    id: "email-capture",
    title: "Email Capture: turn conversations into subscribers",
    description:
      "Collect emails without lifting a finger. Someone texts your keyword, gets asked for their email, and Linkar validates it, stores it, confirms in the DM, and emails them your deliverable automatically.",
    icon: "mail",
    illustration: "email",
    setup: {
      name: "Email capture",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["guide", "freebie", "newsletter"] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Awesome — here’s your free guide! 📬 Drop your email address in the chat and I’ll send it straight over.",
          },
        ],
        emailCapture: {
          promptText: "What’s the best email address to send it to?",
          retryText: "Hmm, that doesn’t look like an email address. Mind typing it again? (e.g. you@example.com)",
          confirmationText: "You’re in! ✅ Check your inbox — the guide is on its way. Talk soon!",
          delivery: {
            subject: "Your guide, as promised 🎁",
            message: "Thanks for subscribing! Here’s the guide you asked about on Instagram.",
            linkUrl: "https://example.com/your-guide-link",
            linkLabel: "Download the guide",
          },
        },
      },
    },
  },
  {
    id: "default-reply",
    title: "Default Reply: send instant replies to incoming Direct Messages",
    description:
      "To handle a high volume of messages, set up a Default Reply. When contacts send a message without matching Keywords, they will immediately receive a predefined Default Reply.",
    icon: "reply",
    illustration: "default",
    setup: {
      name: "Default reply",
      definition: {
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Hi! 👋 Thanks for your message — we’ve got it and a human will reply soon. In a hurry? Text PRICE, HOURS or DELIVERY for an instant answer.",
          },
        ],
      },
    },
  },
  {
    id: "main-menu",
    title: "Main Menu: assist followers in locating information quickly",
    description:
      "Give followers a reliable way to find information anytime. When they text MENU they get an automated reply with tappable options — no digging through the profile needed.",
    icon: "menu",
    illustration: "menu",
    setup: {
      name: "Main menu",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["menu"] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Here’s what I can help with 👇 Text MENU any time to bring these options back.",
          },
          {
            type: "send_button",
            text: "Deals running right now.",
            buttonLabel: "See discounts 💰",
            url: "https://example.com/discounts",
          },
          {
            type: "send_button",
            text: "Shipping times, charges, and returns.",
            buttonLabel: "Delivery info 🛵",
            url: "https://example.com/delivery",
          },
        ],
      },
    },
  },
];

export function getTemplateById(id: string): PremadeTemplate | undefined {
  return basicAutomationTemplates.find((template) => template.id === id);
}
