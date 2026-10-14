import type { SeoPage } from "@/src/content/seo";
import type { ContentBlock } from "@/src/content/seo/types";
import { isCommentTopic, isKeyword, topicVisuals } from "./seo-theme";

/*
 * Reads a page's example (incoming, reply, next) and its steps, and says what
 * kind of thing each one is, so every section draws the same example the same
 * way: an event is a muted system line, a described reply is a dashed
 * automation note, and only a real button label becomes a link button.
 */

/* Present-tense event verbs and how a notification line says them. */
const eventVerbs: Record<string, string> = {
  mentions: "mentioned", messages: "messaged", requests: "requested", comments: "commented",
  replies: "replied", sends: "sent", asks: "asked", shares: "shared", tags: "tagged",
  follows: "followed", taps: "tapped", opens: "opened", books: "booked", types: "typed",
};
const verbList = Object.keys(eventVerbs).join("|");
/* "Someone mentions…", "A viewer requests…", "A new follower comments…". */
const eventPattern = new RegExp(`^(?:when\\s+)?(?:someone|somebody|(?:a|an|the)(?:\\s+[^\\s]+){1,2}?)\\s+(${verbList})\\b\\s*(.*)$`, "i");
/* "Someone messages COURSE": an event that quotes the word the person typed. */
const typedPattern = new RegExp(`^(?:someone|somebody|(?:a|an|the)(?:\\s+[^\\s]+){1,2}?)\\s+(?:messages|comments|sends|types|replies(?:\\s+with)?)\\s+[‘“"']?([^‘’“”"']+?)[’”"']?$`, "i");

/** "Someone mentions your account in their Story" describes an event; "GUIDE" and "Can I see your menu?" are messages. */
export function describesEvent(text: string): boolean {
  const value = text.trim();
  return eventPattern.test(value) || /\btheir\s+(story|post|reel)\b/i.test(value);
}

/** The event as a notification line that follows a handle: "mentioned you in their Story". */
export function eventAction(text: string): string {
  const value = text.trim();
  const match = value.match(eventPattern);
  if (!match) return value.replace(/^(?:when\s+)?(?:someone|somebody|(?:a|an|the)\s+\S+)\s+/i, "");
  const verb = eventVerbs[match[1].toLowerCase()] ?? match[1];
  const rest = match[2].replace(/\byour account\b/gi, "you").trim();
  return rest ? `${verb} ${rest}` : verb;
}

export type IncomingView = {
  kind: "event" | "quote";
  /** quote: the message as typed. event: the line to put after a handle ("requested the guide"). */
  text: string;
  /** The request word when the message is one ("GUIDE", "WEEKEND COURSE"), else null. */
  keyword: string | null;
  /** The editorial text, unchanged. */
  source: string;
};

/** What arrived: a message someone typed, or an event to show as a status line. */
export function incomingFor(page: SeoPage): IncomingView {
  const source = page.example.incoming.trim();
  const typed = source.match(typedPattern);
  if (typed && isKeyword(typed[1])) return { kind: "quote", text: typed[1], keyword: typed[1], source };
  if (describesEvent(source)) {
    let text = eventAction(source);
    // "mentioned you" on a Story page means a Story mention; say so.
    if (page.topic === "stories" && /^mentioned you$/i.test(text)) text = "mentioned you in their Story";
    return { kind: "event", text, keyword: null, source };
  }
  return { kind: "quote", text: source, keyword: isKeyword(source) ? source : null, source };
}

/** "tara.moves mentioned you in their Story", for system lines and notifications. */
export function eventLine(handle: string, incoming: IncomingView): string {
  return incoming.kind === "event" ? `${handle} ${incoming.text}` : incoming.text;
}

/** A Story mention page: the person mentioned you in their own Story rather than replying to yours. */
export function isStoryMention(page: SeoPage): boolean {
  return page.topic === "stories" && incomingFor(page).kind === "event";
}

/*
 * A team page whose example is an automated delivery rather than a handoff
 * (an agency running a client's campaign: "A viewer requests the client’s
 * launch guide" answered by "The approved private reply…"). Its labels and
 * mock UI follow the example, a comment answered by private reply, not the
 * topic's handoff.
 */
function teamDelivery(page: SeoPage): boolean {
  return page.topic === "team" && incomingFor(page).kind === "event";
}

/** Where the example conversation starts: an Instagram post, a Facebook Page post, a Story, or the inbox. */
export type ExampleContext = "post" | "page" | "story" | "inbox";

export function exampleContext(page: SeoPage): ExampleContext {
  if (page.topic === "facebook") return "page";
  if (isCommentTopic(page.topic) || (teamDelivery(page) && /\bprivate reply\b/i.test(page.example.reply))) return "post";
  return page.topic === "stories" ? "story" : "inbox";
}

/**
 * Whether the phone example draws the page's post photo: always on a post,
 * Page post or Story, and in the inbox only when the message is a request word
 * from a caption (the person shares the post with it). A plain question such
 * as "Are you open on Sunday?" has no post behind it.
 */
export function exampleDrawsPost(page: SeoPage): boolean {
  return exampleContext(page) !== "inbox" || incomingFor(page).keyword !== null;
}

export type ReplyView =
  | { kind: "quote"; text: string }
  | { kind: "action"; text: string }
  | { kind: "variants"; variants: readonly { label: string; text: string }[] };

/** The sent message, an action the automation takes, or two reply versions for a test. */
export function replyFor(page: SeoPage): ReplyView {
  const text = page.example.reply.trim();
  const variants = [...text.matchAll(/(?:version|variant)\s+([A-Z0-9]+):\s*[‘“"](.+?)[’”"](?=\s+(?:version|variant)\b|\s*$)/gi)]
    .map((match) => ({ label: match[1].toUpperCase(), text: match[2].trim() }));
  if (variants.length >= 2) return { kind: "variants", variants };
  const described = !/[.!?’”"')]$/.test(text) || /^(the automation|the approved|send|share|ask|deliver|reply with)\b/i.test(text);
  return described ? { kind: "action", text } : { kind: "quote", text };
}

/** False when the reply describes an action ("The automation sends…") or lists test versions. */
export function quotesReply(page: SeoPage): boolean {
  return replyFor(page).kind === "quote";
}

export type NextView =
  | { kind: "button"; label: string }
  | {
    kind: "later";
    label: string;
    /** The message without its quote marks, for places that only need the words. */
    message: string;
    /** The message exactly as written, quote marks included: "‘Need help choosing a session?’". */
    quoted: string;
    /** The editorial text, unchanged. Mock UI shows "label:" then the quoted message, so it reads in full. */
    source: string;
  }
  | {
    kind: "note";
    label: string;
    /**
     * The note's mono tag. "In public" when a Facebook note describes the
     * visible reply itself ("Public reply under the Page comment"); "Next" for
     * a step the business takes after the reply.
     */
    tag: "Next" | "In public";
  };

/* Verbs a visitor would tap. "Check", "Share" and "Review" are steps for the business, not buttons. */
const buttonVerbs = /^(open|see|view|get|read|shop|explore|book|browse|watch|download|claim|start|visit|try|listen|join|register|subscribe)\b/i;

/** "Open the checklist" is a button; "Later: ‘…’" is a later message; anything else is a step for you. */
export function classifyNext(next: string): NextView {
  const value = next.trim();
  const later = value.match(/^([^:‘“"']{2,40}):\s*([‘“"'](.+)[’”"'])$/);
  if (later) return { kind: "later", label: later[1].trim(), message: later[3].trim(), quoted: later[2], source: value };
  const words = value.split(/\s+/).length;
  if (buttonVerbs.test(value) && words <= 5 && !/[,;:]/.test(value) && !/\bthen\b/i.test(value)) return { kind: "button", label: value };
  return { kind: "note", label: value, tag: "Next" };
}

/** classifyNext, plus Facebook Page replies are public: no DM buttons or later private messages, and notes about the visible reply say so. */
export function nextFor(page: SeoPage): NextView {
  const next = classifyNext(page.example.next);
  if (page.topic !== "facebook") return next;
  const label = page.example.next.trim();
  return { kind: "note", label, tag: /\b(public|visible|thread)\b/i.test(label) ? "In public" : "Next" };
}

/** A Facebook note that describes the public reply itself, so it sits with the reply instead of in your workspace. */
export function nextIsPublic(next: NextView): boolean {
  return next.kind === "note" && next.tag === "In public";
}

/** The post or Story caption that asks for the request, in the page's channel. */
export function postCaption(page: SeoPage): string {
  const incoming = incomingFor(page);
  const keyword = incoming.keyword;
  if (page.topic === "facebook") return keyword ? `Comment ${keyword} below for the details.` : "Questions? Ask them in the comments.";
  if (teamDelivery(page)) {
    const resource = incoming.text.replace(/^requested\s+(?:the\s+client’s\s+|the\s+|your\s+)?/i, "");
    return resource && resource !== incoming.text ? `Want the ${resource}? Comment below.` : "Want the details? Comment below.";
  }
  if (!keyword) return "Have a question? Ask it in the comments.";
  if (page.topic === "followers") return `Followers, comment ${keyword} and we’ll send it over.`;
  if (page.topic === "stories") return `Reply ${keyword} to this Story for the link.`;
  if (page.topic === "messages" || page.topic === "leads") return `Send us ${keyword} in a DM for the details.`;
  return `Comment ${keyword} and the link lands in your DMs.`;
}

/** The person's handle in mock UI for this page. */
export function exampleHandle(page: SeoPage, index = 0): string {
  return topicVisuals[page.topic].handles[index % 3];
}

/** The reply's kind of message, for labels and builder chips. */
export function replyLabel(page: SeoPage): "Public reply" | "Private reply" | "Reply" {
  if (page.topic === "facebook") return "Public reply";
  return page.topic === "comments" || page.topic === "followers" ? "Private reply" : "Reply";
}

/** The trigger's name for this page ("Story mention", not "Story reply or mention", on a mention page). */
export function triggerLabel(page: SeoPage): string {
  if (page.topic === "stories") return isStoryMention(page) ? "Story mention" : "Story reply";
  if (teamDelivery(page)) return "Comment on a client post";
  if (/first-message/.test(page.slug)) return "First message";
  return topicVisuals[page.topic].trigger;
}

/** Trigger options that match the step copy: the selected option first. */
export function triggerScope(page: SeoPage): readonly [selected: string, other: string] {
  if (isStoryMention(page)) return ["Story mentions", "Replies to any Story"];
  if (teamDelivery(page)) return ["Selected client posts", "Any client post"];
  if (/first-message/.test(page.slug)) return ["A person’s first message", "Messages containing a keyword"];
  if (/post-specific/.test(page.slug)) return ["Selected Page posts", "Any Page post"];
  return topicVisuals[page.topic].scope;
}

/** The status pill for this page's outcome. */
export function sentLabel(page: SeoPage): string {
  if (isStoryMention(page)) return "Mention acknowledged";
  if (teamDelivery(page) && replyFor(page).kind === "action") return "Approved reply sent";
  return topicVisuals[page.topic].sent;
}

/* ---------- How it works: what each step sets up ---------- */

/**
 * The setup UI a step shows, named by what its title says:
 * - trigger: which comments, messages or Stories start it
 * - requests: the recurring questions you start with
 * - details: the fields you decide to ask for
 * - destination: the page or link the reply points to
 * - instruction: the caption or Story text that asks for the request
 * - message: the reply (or the question it asks)
 * - followup: a later check-in
 * - plan: a step about planning or upkeep ("Define the useful outcome",
 *   "Document the review routine"), drawn from `stepPlan`
 * - activity: reading what the automation did
 * - test: a test run before a later step
 * - live: the last step, testing and switching it on
 */
export type StepKind =
  | "trigger" | "requests" | "details" | "destination" | "instruction" | "message"
  | "followup" | "plan" | "activity" | "test" | "live";

/** A planning or upkeep step as a small settings card: options to pick from, things to tick, a switch. */
export type StepPlan = {
  /** The builder chip: what kind of step this is, in a word or two. */
  chip: string;
  /** The card's heading. */
  title: string;
  /** Radio options, the first one chosen. */
  options?: readonly string[];
  /** Ticked lines. */
  checks?: readonly string[];
  /** A switch row, shown on. */
  toggle?: string;
  /** Show the reply's test versions as tags. */
  versions?: boolean;
};

type PlanRule = readonly [title: RegExp, plan: StepPlan];

/* Each plan restates its step's own copy; nothing here promises more than the step does. */
const planRules: readonly PlanRule[] = [
  [/\buseful outcome\b|\bgoal\b/i, { chip: "Goal", title: "Useful outcome", options: ["Deliver a resource", "Collect an email", "Reach a booking page"] }],
  [/\bone thing at a time\b|\bchange one\b/i, { chip: "One change", title: "What to change", options: ["Keyword", "Opening message", "Destination"], checks: ["Notes kept about the change"] }],
  [/\bone variable\b|\bvariable\b/i, { chip: "Variable", title: "What to test", options: ["Opening message", "Delivery message"], versions: true }],
  [/\bsketch\b|\bintended journey\b/i, { chip: "Plan", title: "Intended journey", checks: ["Incoming request", "Ideal first answer", "Information you need"] }],
  [/\bsupported steps\b/i, { chip: "Setup", title: "Supported steps", checks: ["Automation type or template chosen", "Sample text replaced", "Actions match the channel"] }],
  [/\bentry status\b/i, { chip: "Status", title: "Entry status", options: ["Comment received", "Entry confirmed"], checks: ["Matches the official rules"] }],
  [/\bcontinue personally\b/i, { chip: "Your team", title: "Personal follow-up", toggle: "Hand to your team", checks: ["Answers reviewed before a call", "Booking link tested"] }],
  [/\bfollow requirement\b/i, { chip: "Follow check", title: "Follow requirement", toggle: "Follow check", checks: ["Not-following message", "Recheck button"] }],
  [/\bcampaign stages\b/i, { chip: "Stages", title: "Campaign stages", checks: ["Opening message and opt-in button", "Follow check and recheck", "Delivery destination"] }],
  [/\btracked link\b/i, { chip: "Tracked link", title: "Tracked link", toggle: "Track link visits", checks: ["Test click opens the page", "Activity shows on this automation"] }],
  [/\breview routine\b/i, { chip: "Routine", title: "Review routine", checks: ["Purpose and upkeep written down", "Regular review time set"] }],
  [/\breview part of the work\b/i, { chip: "Routine", title: "Team review", checks: ["New enquiries easy to find", "Records kept current"] }],
  [/\bolder recommendations\b|\bmaintain older\b/i, { chip: "Upkeep", title: "Older recommendations", checks: ["Active links rechecked", "Discontinued items replaced"] }],
];

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const leadVerb = /^(prepare|check|choose|review|maintain|define|publish|update|test|verify|list|host|use|make|pick|set|build|create|configure|write|document)\s+/i;
const fillerWords = /^(?:(?:the|your|a|an|one|real|actual|clear|exact|accurate|maintained|necessary)\s+)+/i;

/** "Prepare your guide link" becomes "Guide link". */
export function stepPhrase(title: string): string {
  return capitalise(title.replace(leadVerb, "").replace(fillerWords, "").trim() || title);
}

/** The settings card for a plan step: its rule, or a neutral card that only restates the title. */
export function stepPlan(title: string): StepPlan {
  const rule = planRules.find(([pattern]) => pattern.test(title));
  return rule ? rule[1] : { chip: "Setup", title: stepPhrase(title), checks: [capitalise(title)] };
}

export const destinationNouns = /\b(destinations?|links?|page|resource|deliverable|menu|price list|policy|source|offer|overview|brochure|itinerary|listing|rules|syllabus|information|details|product|hours)\b/i;
const processNouns = /\b(journeys?|delivery|enquiry|record|route|thread|handoff|transition|enrollment|registration|fulfillment|scope)\b/i;
const triggerPhrases = /\b(story replies|story mentions?|mention trigger|keywords?|words?|post|posts|reel|reels|first contact|trigger|scope|interaction|dm flow|connect|handoff situations|comment campaign|product campaign|course request|follow requirement|eligible)\b/i;
const messageNouns = /\b(write|reply|replies|response|message|answer|acknowledgement|introduction|ending|invitation|instruction|wording|prompts?)\b/i;
const collectNouns = /\b(email|fields?|collection|intake|enquiry flow|information flow|information request|request journey)\b/i;
const instructionTitles = /\b(instruction|caption|request easy|invitation|shopping request)\b/i;
const followupTitles = /\b(check-in|follow-?up|reminder|nudge)\b/i;
const activityTitles = /\b(clicks|activity|insights|before choosing|results)\b/i;
const detailsTitles = /^(define|choose|pick)\b.*\b(details|context|fields?|deciding question)\b/i;
const requestTitles = /^(list|choose|pick)\b.*\b(questions?|topic|request|enquiry type)\b|^list\b/i;
const verifyStart = /^(test|check|review|verify|inspect|walk through)\b/i;
const verifyWord = /\b(test|testing|verify|inspect|publishing)\b/i;

/** Every kind a step title names, strongest first. */
function titleKinds(title: string): StepKind[] {
  const kinds: StepKind[] = [];
  const add = (kind: StepKind) => { if (!kinds.includes(kind)) kinds.push(kind); };
  if (planRules.some(([pattern]) => pattern.test(title))) add("plan");
  if (activityTitles.test(title)) add("activity");
  if (followupTitles.test(title)) add("followup");
  // "Write and test the private reply" is writing first.
  if (/^write\b/i.test(title) && messageNouns.test(title) && !instructionTitles.test(title)) add("message");
  if (verifyStart.test(title)) {
    if (destinationNouns.test(title) && !processNouns.test(title)) add("destination");
    add("live");
  } else if (verifyWord.test(title)) add("live");
  if (instructionTitles.test(title)) add("instruction");
  if (triggerPhrases.test(title)) add("trigger");
  if (messageNouns.test(title)) add("message");
  if (detailsTitles.test(title)) add("details");
  if (requestTitles.test(title)) add("requests");
  if (destinationNouns.test(title)) add("destination");
  if (collectNouns.test(title)) add("message");
  return kinds;
}

/* When the title names nothing, the body's first cue decides ("Decide what the person is trying to do. A keyword…"). */
const bodyCues: readonly (readonly [StepKind, RegExp])[] = [
  ["trigger", /\b(keywords?|words?|posts?|reels?|requests?|handoff)\b/i],
  ["destination", /\b(pages?|links?|destinations?|product)\b/i],
  ["message", /\b(messages?|reply|replies|answers?)\b/i],
];

function bodyKinds(body: string): StepKind[] {
  return bodyCues
    .map(([kind, pattern]) => ({ kind, at: body.search(pattern) }))
    .filter((cue) => cue.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((cue) => cue.kind);
}

/* A kind may repeat on a page only for plans, whose cards differ by step. */
const repeatable = new Set<StepKind>(["plan"]);

/**
 * Which setup UI each step shows, read from its title: never a kind the title
 * does not name. A title that names nothing takes its body's first cue, else a
 * neutral plan card that restates the title. Pages prefer three different
 * kinds, and only the last step can be "live": an earlier test is a test run,
 * so going live never comes before writing the message.
 */
export function stepKinds(page: SeoPage): readonly StepKind[] {
  const steps = page.steps.map(([title, body]: ContentBlock) => {
    const named = titleKinds(title);
    const hinted = named.length > 0 ? [] : bodyKinds(body);
    const candidates: { kind: StepKind; cost: number }[] = [
      ...named.map((kind, rank) => ({ kind, cost: rank })),
      ...hinted.map((kind, rank) => ({ kind, cost: 5 + rank })),
    ];
    if (!candidates.some((candidate) => candidate.kind === "plan")) candidates.push({ kind: "plan", cost: 20 });
    return candidates.slice(0, 5);
  });
  let best: { kinds: StepKind[]; cost: number } | null = null;
  const visit = (index: number, kinds: StepKind[], cost: number) => {
    if (best && cost >= best.cost) return;
    if (index === steps.length) {
      best = { kinds: [...kinds], cost };
      return;
    }
    for (const candidate of steps[index]) {
      const repeat = kinds.includes(candidate.kind) && !repeatable.has(candidate.kind) ? 8 : 0;
      kinds.push(candidate.kind);
      visit(index + 1, kinds, cost + candidate.cost + repeat);
      kinds.pop();
    }
  };
  visit(0, [], 0);
  const chosen: StepKind[] = (best as { kinds: StepKind[] } | null)?.kinds ?? page.steps.map(() => "plan");
  const last = chosen.length - 1;
  return chosen.map((kind, index) => (kind === "live" && index < last ? "test" : kind));
}
