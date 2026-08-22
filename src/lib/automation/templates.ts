import type { FlowDefinitionV1 } from "./types";

export type TemplateIllustration = "follow" | "faq" | "story" | "default" | "menu";

/**
 * A premade automation recipe shown in the Basic gallery. Available recipes carry a
 * builder prefill (`setup`) that is always a version-1 definition so the classic
 * builder can open it directly; unavailable recipes describe a capability the engine
 * does not have yet and never carry one.
 */
export type PremadeTemplate = {
  id: string;
  title: string;
  description: string;
  /** Small pill rendered next to the title, e.g. "BETA". */
  badge?: string;
  /** False when the engine cannot run this recipe yet; see `unavailableNote`. */
  available: boolean;
  unavailableNote?: string;
  icon: "user-plus" | "message" | "at-sign" | "reply" | "menu";
  illustration: TemplateIllustration;
  /** Prefill handed to the builder when the template is set up. */
  setup?: { name: string; definition: FlowDefinitionV1 };
};

export const basicAutomationTemplates: PremadeTemplate[] = [
  {
    id: "welcome-new-followers",
    title: "Say hi to new followers: first impressions are everything",
    description:
      "A one-time welcome DM sent through Meta’s official API to new Instagram followers the moment they hit follow, but only the first time they do.",
    badge: "BETA",
    available: false,
    unavailableNote: "Follow events are not part of the engine yet.",
    icon: "user-plus",
    illustration: "follow",
  },
  {
    id: "conversation-starters",
    title: "Conversation Starters: help customers start a conversation with your business",
    description:
      "Creating a positive first impression is essential. When someone messages your Instagram account about prices, hours, or delivery, they instantly get a helpful reply with tappable buttons.",
    available: true,
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
    available: false,
    unavailableNote: "Story mention triggers are on the roadmap.",
    icon: "at-sign",
    illustration: "story",
  },
  {
    id: "default-reply",
    title: "Default Reply: send instant replies to incoming Direct Messages",
    description:
      "To handle a high volume of messages, set up a Default Reply. When contacts send a message without matching Keywords, they will immediately receive a predefined Default Reply.",
    available: true,
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
    available: true,
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
