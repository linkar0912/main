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
    title: "Open the right door",
    body: "When the right comment arrives, Linkar sends a useful private reply in your voice.",
    scene: "comment",
  },
  {
    id: "qualify",
    eyebrow: "02",
    title: "Learn what matters",
    body: "Ask one focused question, save the answer, and shape the next message around it.",
    scene: "qualify",
  },
  {
    id: "followup",
    eyebrow: "03",
    title: "Return on time",
    body: "Schedule a thoughtful follow-up while the conversation is still open — no reminder list required.",
    scene: "followup",
  },
  {
    id: "handoff",
    eyebrow: "04",
    title: "Bring in a person",
    body: "When intent becomes valuable or nuanced, pause the flow and place the full context in your queue.",
    scene: "handoff",
  },
];

export const surfaceCards: SurfaceCard[] = [
  {
    id: "comment-triggers",
    title: "Comment triggers",
    body: "Turn a chosen word beneath a post into a relevant private reply.",
    preview: ["Comment", "Keyword rule", "Reply"],
  },
  {
    id: "dm-triggers",
    title: "DM triggers",
    body: "Recognize an incoming phrase and guide the conversation from the first message.",
    preview: ["Message", "Phrase rule", "Prompt"],
  },
  {
    id: "story-mentions",
    title: "Story mentions",
    body: "Acknowledge a mention while the moment is still warm.",
    preview: ["Mention", "Thank-you", "Question"],
  },
  {
    id: "follow-gated-campaigns",
    title: "Follow-gated campaigns",
    body: "Check the condition before releasing the promised next step.",
    preview: ["Request", "Condition check", "Delivery"],
  },
];

export const workflowItems: WorkflowItem[] = [
  {
    id: "guide-delivery",
    label: "Guide delivery",
    title: "Guide delivery",
    body: "Send the right resource, then ask what the person wants to solve.",
    event: "Keyword trigger",
    reply: "Send guide → Ask goal",
  },
  {
    id: "lead-qualifier",
    label: "Lead qualifier",
    title: "Lead qualifier",
    body: "Capture one useful answer before deciding the next branch.",
    event: "DM phrase",
    reply: "Ask question → Save answer → Branch",
  },
  {
    id: "timed-nurture",
    label: "Timed nurture",
    title: "Timed nurture",
    body: "Return with a relevant check-in while the conversation remains active.",
    event: "Reply received",
    reply: "Wait 18 hours → Send check-in",
  },
  {
    id: "human-handoff",
    label: "Human handoff",
    title: "Human handoff",
    body: "Pause when nuance or intent calls for a person, with context intact.",
    event: "Intent signal",
    reply: "Pause flow → Add to queue",
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
      "No. You choose triggers, conditions, replies, waits, and handoff steps in a visual flow. The underlying rules stay explicit and reviewable.",
  },
  {
    id: "human-takeover",
    question: "What happens when a person should take over?",
    answer:
      "A handoff step pauses the automated path, keeps the conversation context together, and places it in a queue for your team.",
  },
];
