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
};

export type WorkflowItem = {
  id: string;
  label: string;
  title: string;
  body: string;
  event: string;
  reply: string;
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
  },
  {
    id: "dm-triggers",
    title: "Answer common messages",
    body: "Recognize questions about prices, hours, or delivery and answer them straight away.",
    preview: ["Someone messages", "Question matches", "Helpful answer"],
  },
  {
    id: "story-mentions",
    title: "Thank people for Story mentions",
    body: "Send a warm thank-you when someone mentions your account in an Instagram Story.",
    preview: ["Story mention", "Thank-you message", "Next question"],
  },
  {
    id: "follow-gated-campaigns",
    title: "Send links to followers",
    body: "Ask permission, check that the person follows you, and then send the promised link.",
    preview: ["Link requested", "Follower checked", "Link sent"],
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
  },
  {
    id: "lead-qualifier",
    label: "Ask what someone needs",
    title: "Ask what someone needs",
    body: "Ask one useful question and choose the next reply from their answer.",
    event: "Someone sends a message",
    reply: "Ask a question → Save the answer → Send the right reply",
  },
  {
    id: "timed-nurture",
    label: "Follow up later",
    title: "Follow up later",
    body: "Send a friendly check-in while the conversation is still open.",
    event: "Someone replies",
    reply: "Wait 18 hours → Send a reminder",
  },
  {
    id: "human-handoff",
    label: "Let your team take over",
    title: "Let your team take over",
    body: "Pause automatic replies and give your team the conversation so far.",
    event: "Someone asks for personal help",
    reply: "Pause automatic replies → Move to the team inbox",
  },
];

export const faqItems: FaqItem[] = [
  {
    id: "account-safety",
    question: "How does Linkar protect my account?",
    answer:
      "Linkar uses the connection you authorize, encrypts stored access tokens, verifies incoming requests, and keeps each workspace’s data scoped to that workspace.",
  },
  {
    id: "official-api",
    question: "Does Linkar use the official API?",
    answer:
      "Yes. Linkar sends and receives supported messaging events through the platform’s official API and honors the active messaging window.",
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
