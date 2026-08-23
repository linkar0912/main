import type { FlowDefinitionV1 } from "./types";

export type TemplateTriggerType = FlowDefinitionV1["trigger"]["type"];

/**
 * A premade automation recipe shown in the template picker. Every recipe is runnable on
 * the current engine and carries a builder prefill (`setup`) that is always a version-1
 * definition so the classic builder can open it directly.
 */
export type PremadeTemplate = {
  id: string;
  title: string;
  description: string;
  icon:
  | "user-plus"
  | "message"
  | "at-sign"
  | "reply"
  | "menu"
  | "mail"
  | "link"
  | "megaphone"
  | "user-check"
  | "check"
  | "gift"
  | "shopping-bag";
  /** Surfaced first, under "Recommended", like a platform's own featured picks. */
  popular?: boolean;
  /** Prefill handed to the builder when the template is set up. */
  setup: { name: string; definition: FlowDefinitionV1 };
};

export const basicAutomationTemplates: PremadeTemplate[] = [
  {
    id: "comment-link-dm",
    title: "Auto-DM links from comments",
    description: "Someone comments your keyword on a post or Reel, and Linkar DMs them the link privately - no public reply, no manual copy-paste.",
    icon: "link",
    popular: true,
    setup: {
      name: "Auto-DM links from comments",
      definition: {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["link", "shop"], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "Thanks for asking! Here’s the link: https://example.com/link" }],
      },
    },
  },
  {
    id: "conversation-starters",
    title: "Conversation Starters",
    description: "Creating a positive first impression is essential. When someone messages your Instagram account about prices, hours, or delivery, they instantly get a helpful reply with tappable buttons.",
    icon: "message",
    popular: true,
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
            text: "Pricing, working hours, and delivery details - all in one place.",
            buttonLabel: "See pricing & FAQs",
            url: "https://example.com/faqs",
          },
        ],
      },
    },
  },
  {
    id: "email-capture",
    title: "Email Capture",
    description: "Collect emails without lifting a finger. Someone texts your keyword, gets asked for their email, and Linkar validates it, stores it, confirms in the DM, and emails them your deliverable automatically.",
    icon: "mail",
    popular: true,
    setup: {
      name: "Email capture",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["guide", "freebie", "newsletter"] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Awesome - here’s your free guide! 📬 Drop your email address in the chat and I’ll send it straight over.",
          },
        ],
        emailCapture: {
          promptText: "What’s the best email address to send it to?",
          retryText: "Hmm, that doesn’t look like an email address. Mind typing it again? (e.g. you@example.com)",
          confirmationText: "You’re in! ✅ Check your inbox - the guide is on its way. Talk soon!",
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
    id: "welcome-new-followers",
    title: "Say hi to new followers",
    description: "A one-time welcome DM for every new person who starts their first conversation with you. Meta’s API never exposes follows directly, so Linkar greets each first-time contact exactly once - no repeats, ever.",
    icon: "user-plus",
    setup: {
      name: "Welcome new contacts",
      definition: {
        version: 1,
        trigger: { type: "first_contact" },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Hi there 👋 Thanks for reaching out! I’m here whenever you need prices, hours, or anything else - just say the word.",
          },
        ],
      },
    },
  },
  {
    id: "story-mention-reply",
    title: "Story Mention Reply",
    description: "When followers mention your Instagram account in their Story, you can send a ‘Thank You’ message or start an automated conversation to engage and chat with customers at scale.",
    icon: "at-sign",
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
    id: "default-reply",
    title: "Default Reply",
    description: "To handle a high volume of messages, set up a Default Reply. When contacts send a message without matching Keywords, they will immediately receive a predefined Default Reply.",
    icon: "reply",
    setup: {
      name: "Default reply",
      definition: {
        version: 1,
        trigger: { type: "message", match: "any", keywords: [] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Hi! 👋 Thanks for your message - we’ve got it and a human will reply soon. In a hurry? Text PRICE, HOURS or DELIVERY for an instant answer.",
          },
        ],
      },
    },
  },
  {
    id: "main-menu",
    title: "Main Menu",
    description: "Give followers a reliable way to find information anytime. When they text MENU they get an automated reply with tappable options - no digging through the profile needed.",
    icon: "menu",
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
  {
    id: "comment-catch-all",
    title: "Respond to every comment",
    description: "Every comment on your posts and Reels gets an instant private reply - perfect for launches and high-volume moments when you can’t keep up manually.",
    icon: "megaphone",
    setup: {
      name: "Respond to every comment",
      definition: {
        version: 1,
        trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] },
        conditions: [],
        actions: [{ type: "private_reply", text: "Thanks for the comment! 🙌 We’ll get back to you shortly." }],
      },
    },
  },
  {
    id: "referral-welcome",
    title: "Ad referral welcome",
    description: "Greet people the moment they tap through from an Instagram ad or referral link - the first message they get, warm and on-brand instead of silence.",
    icon: "user-check",
    setup: {
      name: "Ad referral welcome",
      definition: {
        version: 1,
        trigger: { type: "referral" },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Hey! 👋 Thanks for tapping through - you’re in the right place. What can I help you find today?",
          },
        ],
      },
    },
  },
  {
    id: "optin-confirmation",
    title: "One-tap opt-in confirmation",
    description: "Confirm instantly when someone taps your opt-in button, so they know it worked - with a link to what they just signed up for.",
    icon: "check",
    setup: {
      name: "Opt-in confirmation",
      definition: {
        version: 1,
        trigger: { type: "optin" },
        conditions: [],
        actions: [
          {
            type: "send_button",
            text: "You’re confirmed! ✅ Here’s where to go next.",
            buttonLabel: "Take me there",
            url: "https://example.com/welcome",
          },
        ],
      },
    },
  },
  {
    id: "giveaway-entry",
    title: "Giveaway entry confirmation",
    description: "Turn giveaway comments into confirmed entries - the moment someone DMs your keyword, they get an instant confirmation and a link to the rules.",
    icon: "gift",
    setup: {
      name: "Giveaway entry confirmation",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["win", "giveaway", "enter"] },
        conditions: [],
        actions: [
          {
            type: "send_button",
            text: "You’re entered! 🎉 Good luck - winners are announced in our Stories.",
            buttonLabel: "See the rules",
            url: "https://example.com/giveaway-rules",
          },
        ],
      },
    },
  },
  {
    id: "affiliate-link",
    title: "Affiliate link delivery",
    description: "Your keyword triggers an instant DM with your shoppable or affiliate link - no manual copy-paste, no missed sales while you sleep.",
    icon: "shopping-bag",
    setup: {
      name: "Affiliate link delivery",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["shop", "buy"] },
        conditions: [],
        actions: [
          {
            type: "send_button",
            text: "Here’s the link you asked about 🛍️",
            buttonLabel: "Shop now",
            url: "https://example.com/shop",
          },
        ],
      },
    },
  },
];

export function getTemplateById(id: string): PremadeTemplate | undefined {
  return basicAutomationTemplates.find((template) => template.id === id);
}

const TRIGGER_LABELS: Record<TemplateTriggerType, string> = {
  comment: "Post & Reel comments",
  message: "Direct messages",
  story_mention: "Story mentions",
  first_contact: "First contact",
  referral: "Ad referrals",
  optin: "Opt-in taps",
};

export function triggerLabel(type: TemplateTriggerType): string {
  return TRIGGER_LABELS[type];
}
