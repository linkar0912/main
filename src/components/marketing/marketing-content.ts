import { BILLING_PLANS, FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";

export type StoryChapter = {
  id: string;
  eyebrow: string;
  title: string;
  body: string;
  scene: "comment" | "qualify" | "followup" | "handoff";
};

export type SurfaceCard = {
  id: string;
  title: string;
  body: string;
  preview: readonly [string, string, string];
  /** The feature guide that explains this card in depth. */
  href: `/features/${string}`;
  /** Anchor text for that guide: names the feature, never "Learn more". */
  linkLabel: string;
};

export type WorkflowItem = {
  id: string;
  label: string;
  title: string;
  body: string;
  event: string;
  reply: string;
  /** The ready-made recipe this example is built from. */
  href: `/templates/${string}`;
  /** Anchor text for that recipe: names the template, never "Learn more". */
  linkLabel: string;
};

export type FaqItem = {
  id: string;
  question: string;
  answer: string;
};

export const storyChapters: StoryChapter[] = [
  {
    id: "comment",
    eyebrow: "01",
    title: "Reply right away",
    body: "When someone leaves the comment you are looking for, Linkar privately sends the reply you wrote.",
    scene: "comment",
  },
  {
    id: "qualify",
    eyebrow: "02",
    title: "Ask one useful question",
    body: "Find out what someone needs, save their answer, and send the most helpful next message.",
    scene: "qualify",
  },
  {
    id: "followup",
    eyebrow: "03",
    title: "Follow up at the right time",
    body: "Schedule a friendly reminder while the conversation is still open. Linkar remembers when to send it.",
    scene: "followup",
  },
  {
    id: "handoff",
    eyebrow: "04",
    title: "Let your team take over",
    body: "When someone needs a personal answer, pause automatic replies and keep the conversation ready for your team.",
    scene: "handoff",
  },
];

export const surfaceCards: SurfaceCard[] = [
  {
    id: "comment-triggers",
    title: "Reply when someone comments",
    body: "Choose a word such as GUIDE or PRICE and privately send the answer they asked for.",
    preview: ["Someone comments", "Chosen word matches", "Private reply"],
    href: "/features/instagram-comment-to-dm",
    linkLabel: "Instagram comment to DM automation",
  },
  {
    id: "dm-triggers",
    title: "Answer common messages",
    body: "Recognise questions about prices, hours, or delivery and answer them straight away.",
    preview: ["Someone messages", "Question matches", "Helpful answer"],
    href: "/features/instagram-dm-automation",
    linkLabel: "Instagram DM automation",
  },
  {
    id: "story-mentions",
    title: "Thank people for Story mentions",
    body: "Send a warm thank-you when someone mentions your account in an Instagram Story.",
    preview: ["Story mention", "Thank-you message", "Next question"],
    href: "/features/instagram-story-mention-replies",
    linkLabel: "Instagram Story mention replies",
  },
  {
    id: "follow-gated-campaigns",
    title: "Send links to followers",
    body: "Ask permission, check that the person follows you, and then send the promised link.",
    preview: ["Link requested", "Follower checked", "Link sent"],
    href: "/features/instagram-follow-gate",
    linkLabel: "Instagram follow-gated campaigns",
  },
];

export const workflowItems: WorkflowItem[] = [
  {
    id: "guide-delivery",
    label: "Send a free guide",
    title: "Send a free guide",
    body: "Share the promised resource, then ask what the person would like help with.",
    event: "Someone comments GUIDE",
    reply: "Send the guide → Ask what they need",
    href: "/templates/comment-guide-delivery",
    linkLabel: "Instagram comment to guide template",
  },
  {
    id: "lead-qualifier",
    label: "Ask what someone needs",
    title: "Ask what someone needs",
    body: "Ask one useful question and choose the next reply from their answer.",
    event: "Someone sends a message",
    reply: "Ask a question → Save the answer → Send the right reply",
    href: "/templates/lead-qualification",
    linkLabel: "Instagram lead qualification template",
  },
  {
    id: "timed-nurture",
    label: "Follow up later",
    title: "Follow up later",
    body: "Send a friendly check-in while the conversation is still open.",
    event: "Someone replies",
    reply: "Wait 18 hours → Send a reminder",
    href: "/templates/offer-follow-up",
    linkLabel: "Instagram offer follow-up template",
  },
  {
    id: "human-handoff",
    label: "Let your team take over",
    title: "Let your team take over",
    body: "Pause automatic replies and give your team the conversation so far.",
    event: "Someone asks for personal help",
    reply: "Pause automatic replies → Move to the team inbox",
    href: "/templates/support-handoff",
    linkLabel: "Instagram support handoff template",
  },
];

const rupees = (paise: number) => `₹${(paise / 100).toLocaleString("en-IN")}`;
const { creator, growth, agency } = BILLING_PLANS;

/**
 * The homepage FAQ, also published as FAQPage structured data and in llms.txt.
 * The first questions answer what people search for; keep every answer
 * literally true. The opening definition stays between 40 and 60 words so it
 * can be quoted on its own.
 */
export const faqItems: FaqItem[] = [
  {
    id: "what-is-instagram-automation",
    question: "What is Instagram automation?",
    answer:
      "Instagram automation is a set of rules that replies to comments, DMs and Story mentions for you, using the words, links and next steps you choose. Linkar is an Instagram automation tool that runs these rules through Meta’s official Instagram API, so replies go out from your own professional account while your team handles anything personal.",
  },
  {
    id: "comment-to-dm",
    question: "How do I auto-reply to Instagram comments with a DM?",
    answer:
      "Create an automation on a post or reel, choose the words that should start it, and write the message. When someone comments, Linkar sends them that message as an auto DM, through a private reply.",
  },
  {
    id: "allowed",
    question: "Is Instagram DM automation allowed?",
    answer:
      "Yes, when it runs through Meta’s official Instagram API. Linkar passed Meta App Review, uses only that API, and replies within Meta’s messaging rules.",
  },
  {
    id: "price",
    question: "How much does Linkar cost?",
    answer:
      `You can start free with ${FREE_BILLING_PLAN.automationLimit} automations and ${FREE_BILLING_PLAN.monthlyDeliveryLimit.toLocaleString("en-IN")} messages a month. Paid plans are ${rupees(creator.monthlyPaise)}, ${rupees(growth.monthlyPaise)} and ${rupees(agency.monthlyPaise)} a month, or ${rupees(creator.annualPaise)}, ${rupees(growth.annualPaise)} and ${rupees(agency.annualPaise)} a year, billed in rupees, GST included.`,
  },
  {
    id: "accounts",
    question: "Which Instagram accounts can I connect?",
    answer:
      "Professional accounts, either Business or Creator. Meta’s API does not support personal accounts, so switch to a professional account in the Instagram app first. It is free.",
  },
  {
    id: "followers-only",
    question: "Can I send a link only to people who follow me?",
    answer:
      "Yes. A follow-gated campaign asks permission, checks that the person follows you, and then sends the promised link.",
  },
  {
    id: "account-safety",
    question: "How does Linkar protect my account?",
    answer:
      "Linkar uses the connection you authorise, encrypts stored access tokens, verifies incoming requests, and keeps each workspace’s data scoped to that workspace.",
  },
  {
    id: "no-code",
    question: "Do I need to write code?",
    answer:
      "No. Choose what should start a reply, write the messages, and decide when your team should take over. Linkar guides you through each step.",
  },
  {
    id: "human-takeover",
    question: "What happens when a person should take over?",
    answer:
      "Linkar pauses automatic replies, keeps the conversation together, and moves it to your team’s inbox.",
  },
];
