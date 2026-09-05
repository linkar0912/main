import type { FlowDefinitionV1 } from "./types";
import { facebookPageAutomationTemplates } from "./templates/facebook-page";

export type TemplateTriggerType = FlowDefinitionV1["trigger"]["type"];

/**
 * A premade automation recipe shown in the template picker. Every recipe is runnable on
 * the current engine and carries a builder prefill (`setup`) that is always a version-1
 * definition so the classic builder can open it directly.
 */
export type PremadeTemplate = {
  provider: "INSTAGRAM" | "FACEBOOK";
  surface: "COMMENT" | "MESSAGING";
  requiredCapabilities: readonly string[];
  id: string;
  title: string;
  description: string;
  howItWorks: string[];
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

type LegacyInstagramTemplate = Omit<PremadeTemplate, "provider" | "surface" | "requiredCapabilities" | "howItWorks">;

const PLAIN_COPY_OVERRIDES: Record<string, { title?: string; description?: string }> = {
  "comment-link-dm": {
    title: "Send a link when someone comments",
    description: "When someone comments with a word you choose, Linkar sends your link in a private reply.",
  },
  "story-mention-reply": {
    title: "Thank people who mention you in a Story",
    description: "When someone mentions you in a Story, Linkar sends the thank-you message you saved.",
  },
  "default-reply": {
    title: "Reply to every new message",
    description: "When a message does not match another reply, Linkar sends this helpful fallback.",
  },
  "optin-confirmation": {
    title: "Confirm a button tap",
    description: "When someone taps your permission button, Linkar confirms it and shares the next step.",
  },
};

function conciseDescription(template: LegacyInstagramTemplate): string {
  const override = PLAIN_COPY_OVERRIDES[template.id]?.description;
  if (override) return override;
  const firstSentence = template.description.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim();
  if (firstSentence && firstSentence.length <= 140) return firstSentence;
  switch (template.setup.definition.trigger.type) {
    case "comment": return "When someone comments, Linkar sends the reply you saved.";
    case "message": return "When someone sends a matching message, Linkar replies with the information you saved.";
    case "story_mention": return "When someone mentions you in a Story, Linkar sends your saved reply.";
    case "first_contact": return "When someone messages you for the first time, Linkar sends a warm welcome.";
    case "referral": return "When someone arrives from an ad or referral link, Linkar welcomes them in a message.";
    case "optin": return "When someone agrees to receive a message, Linkar confirms what happens next.";
  }
}

function naturalSteps(template: LegacyInstagramTemplate): string[] {
  const trigger = template.setup.definition.trigger;
  const first = trigger.type === "comment"
    ? trigger.match === "any" ? "Someone comments on your post or Reel." : "Someone comments using a word you choose."
    : trigger.type === "message"
      ? trigger.match === "any" ? "Someone sends you a new message." : "Someone messages you using a word you choose."
      : trigger.type === "story_mention" ? "Someone mentions you in an Instagram Story."
        : trigger.type === "first_contact" ? "Someone starts their first conversation with you."
          : trigger.type === "referral" ? "Someone opens your chat from an ad or referral link."
            : "Someone agrees to receive your message.";
  if (template.setup.definition.emailCapture) {
    return [first, "Linkar asks for their email and any details you need.", "Linkar confirms their details and sends what you promised."];
  }
  return [first, "Linkar sends the reply you saved."];
}

const legacyInstagramTemplates: LegacyInstagramTemplate[] = [
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
    title: "Comment anything, get a reply",
    description: "No keyword needed - anyone who comments anything at all on your posts and Reels gets an instant private reply. The catch-all for launches and high-volume moments when you can’t keep up manually.",
    icon: "megaphone",
    popular: true,
    setup: {
      name: "Comment anything, get a reply",
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
  {
    id: "lead-magnet-comment",
    title: "Lead magnet from comments",
    description: "Viewers comment GUIDE on your post and instantly get the promised PDF, checklist, or resource link by private reply - zero manual sending.",
    icon: "gift",
    popular: true,
    setup: {
      name: "Lead magnet from comments",
      definition: {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["guide", "pdf", "free"], mediaIds: [] },
        conditions: [],
        actions: [
          {
            type: "private_reply",
            text: "Here’s your free guide 🎁 https://example.com/guide - enjoy, and ping me anytime with questions!",
          },
        ],
      },
    },
  },
  {
    id: "price-list-responder",
    title: "Price list responder",
    description: "The classic D2C move: anyone who DMs “price” or “rates” gets your product photo with prices and a tappable catalog - instantly, at 2am included.",
    icon: "shopping-bag",
    popular: true,
    setup: {
      name: "Price list responder",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["price", "rates", "cost"] },
        conditions: [],
        actions: [
          {
            type: "send_image",
            imageUrl: "https://example.com/images/price-list.jpg",
            caption: "Our latest price list 🏷️ Handmade, small-batch, ships across India.",
          },
          {
            type: "send_button",
            text: "Want the full catalog with all variants?",
            buttonLabel: "Open catalog",
            url: "https://example.com/catalog",
          },
        ],
      },
    },
  },
  {
    id: "course-faq-booking",
    title: "Course & coaching FAQ",
    description: "Answer “what’s the fee / how do I join” style DMs with your program details and a booking link for discovery calls - so warm leads never go cold.",
    icon: "menu",
    setup: {
      name: "Course & coaching FAQ",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["course", "cohort", "enroll", "join", "fee"] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Thanks for asking about the program! 📚 Next cohort starts soon - 4 weeks live, recordings included.",
          },
          {
            type: "send_button",
            text: "Grab a free 15-minute discovery call and we’ll see if it’s a fit.",
            buttonLabel: "Book a call",
            url: "https://example.com/book",
          },
        ],
      },
    },
  },
  {
    id: "event-registration",
    title: "Event & webinar registration",
    description: "DM your event keyword and Linkar collects their name, email, and phone in chat, confirms the seat, and files the lead - ready for reminders.",
    icon: "mail",
    setup: {
      name: "Event & webinar registration",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["webinar", "event", "register"] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "You’re in the queue for our next live session! 🎟️ Let me grab your details for the confirmation.",
          },
        ],
        emailCapture: {
          promptText: "What email should your seat confirmation go to?",
          retryText: "Hmm, that email doesn’t look right - mind typing it again?",
          confirmationText: "Seat confirmed! ✅ Calendar invite and joining link are on their way.",
          exitText: "No problem - the invite stays open if you change your mind!",
          fields: [
            { id: "name", question: "And what’s your name?", kind: "text" },
            { id: "phone", question: "Best phone number for a reminder an hour before we go live?", kind: "phone" },
          ],
          delivery: {
            subject: "Your seat is confirmed 🎟️",
            message: "Thanks for registering! Your joining link is below - we start sharp.",
            linkUrl: "https://example.com/join",
            linkLabel: "Joining link",
          },
        },
      },
    },
  },
  {
    id: "influencer-collab-intake",
    title: "Influencer collab intake",
    description: "Brands and creators DM “collab” and get a tidy intake: niche, handle, and email captured in chat - no lost opportunities buried in the request folder.",
    icon: "at-sign",
    setup: {
      name: "Influencer collab intake",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["collab", "partnership", "sponsor"] },
        conditions: [],
        actions: [
          {
            type: "send_text",
            text: "Love it - let’s talk collabs! 🤝 A few quick questions and our partnerships team follows up within a day.",
          },
        ],
        emailCapture: {
          promptText: "First, what email should we reach you at?",
          retryText: "That doesn’t look like an email - could you type it once more?",
          confirmationText: "Perfect - you’re all set! Our team will be in touch very soon. 🧡",
          exitText: "All good! Drop “collab” anytime if things change.",
          fields: [
            { id: "niche", question: "What’s your content niche?", kind: "text" },
            { id: "handle", question: "Which platform do you create on most?", kind: "text" },
          ],
          notifyUrl: "https://hooks.zapier.com/hooks/catch/example/collabs",
        },
      },
    },
  },
  {
    id: "giveaway-comment-entry",
    title: "Giveaway comment entry",
    description: "Turn giveaway comments into confirmed entries - commenting ENTER gets an instant private reply with the rules, so nobody wonders if they’re counted.",
    icon: "gift",
    setup: {
      name: "Giveaway comment entry",
      definition: {
        version: 1,
        trigger: { type: "comment", match: "keyword", keywords: ["enter", "win", "me"], mediaIds: [] },
        conditions: [],
        actions: [
          {
            type: "private_reply",
            text: "You’re entered! 🎉 Winners are announced in our Stories next week - keep an eye out!",
          },
        ],
      },
    },
  },
  {
    id: "offer-followup",
    title: "Offer with follow-up nudge",
    description: "Send your offer DM, then automatically nudge “Still interested?” a day later if they haven’t replied - scheduled follow-ups recover drifting leads.",
    icon: "megaphone",
    setup: {
      name: "Offer with follow-up nudge",
      definition: {
        version: 1,
        trigger: { type: "message", match: "keyword", keywords: ["offer", "deal", "discount"] },
        conditions: [],
        actions: [
          {
            type: "send_button",
            text: "Here’s this week’s offer - 20% off everything until Sunday! 🏷️",
            buttonLabel: "Claim the offer",
            url: "https://example.com/offer",
          },
        ],
        followUps: [
          {
            delayMinutes: 24 * 60,
            text: "Quick nudge 👋 Your 20% off code expires tonight - still want in?",
            buttonLabel: "Use my code",
            url: "https://example.com/offer",
          },
        ],
      },
    },
  },
];

export const instagramAutomationTemplates: PremadeTemplate[] = legacyInstagramTemplates.map((template) => {
  const surface = template.setup.definition.trigger.type === "comment" ? "COMMENT" : "MESSAGING";
  return {
    ...template,
    title: PLAIN_COPY_OVERRIDES[template.id]?.title ?? template.title,
    description: conciseDescription(template),
    howItWorks: naturalSteps(template),
    provider: "INSTAGRAM",
    surface,
    requiredCapabilities: [surface === "COMMENT" ? "instagram-comment" : "instagram-messaging"],
  };
});

export const basicAutomationTemplates: PremadeTemplate[] = [
  ...instagramAutomationTemplates,
  ...facebookPageAutomationTemplates,
];

export function getCompatibleTemplates(input: {
  provider: PremadeTemplate["provider"];
  surface: PremadeTemplate["surface"];
  capabilities: readonly string[];
}): PremadeTemplate[] {
  const available = new Set(input.capabilities);
  return basicAutomationTemplates.filter((template) =>
    template.provider === input.provider
    && template.surface === input.surface
    && template.requiredCapabilities.every((capability) => available.has(capability)));
}

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
