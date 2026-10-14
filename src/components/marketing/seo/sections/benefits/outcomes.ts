import type { SeoPage, SeoTopic } from "@/src/content/seo";
import type { ContentBlock } from "@/src/content/seo/types";
import { exampleContext, incomingFor, nextFor, replyFor, stepKinds } from "../../seo-example";

/*
 * Benefits draw outcomes: what someone sees after the automation has done its
 * job. Each benefit gets the outcome its own words point at (a link preview for
 * "a maintained page", a team inbox row for "a place for exceptions"), and no
 * two benefits on a page share one. Pure, so a script can check every page.
 */

export type OutcomeKind =
  | "notify" | "preview" | "caption" | "routes" | "boundary" | "menu" | "contact" | "search"
  | "handoff" | "pipeline" | "activity" | "public" | "gate" | "schedule" | "optout" | "retry";

type Rule = {
  /** Strong signal: words in the benefit title. */
  title: RegExp;
  /** Weaker signal: words in the benefit body. */
  body?: RegExp;
  /** Topics that may show it at all. */
  topics?: readonly SeoTopic[];
  /** Special purpose: only when the benefit names it. */
  needsMatch?: boolean;
};

const instagram: readonly SeoTopic[] = ["comments", "messages", "stories", "leads", "followers", "team", "insights"];

const rules: Record<OutcomeKind, Rule> = {
  notify: {
    title: /\b(voice|words, every|thank|acknowledg|welcome|introduc|consistent|notice|old content|working time|calm|first response|tied to the story|keep replies|write your own|own answer|practical answer|room for a conversation|explain the programme)/i,
    body: /\b(thank|acknowledg|sounds like|your voice|short opening)/i,
    topics: ["comments", "messages", "stories", "leads", "followers", "team", "facebook"],
  },
  preview: {
    title: /\b(destination|page|link|price|hours|policy|syllabus|overview|details|information|rules|terms|store|sizing|booking|registration|itinerary|resource|maintain|practical|offers?|episode|listing|source|signup|disclos|visible|recognisable|requirements accessible|next steps?|coverage)/i,
    body: /\b(pages?|destinations?|maintained|links?)\b/i,
  },
  caption: {
    title: /\b(promise|caption|fits the post|from the post|featured|right episode|look to its products|viewers saw|deliver the|send the (?:featured|listing|current|correct|right|shopper)|less searching|requirement people can see|upfront|commercial links)/i,
    body: /\b(caption|from th(?:at|is) (?:tutorial|post|reel|story)|the post they saw)\b/i,
    topics: ["comments", "messages", "stories", "leads", "followers", "insights", "facebook"],
  },
  routes: {
    title: /\b(separate|distinct|specific|each|scope|scoped|selected|campaign posts|collections|cohorts|concurrent|relevant|different requests|campaign words?|right scope|right campaign|deliberately|match|interaction|compare|ownership|individual automations)/i,
    body: /\b(separate|selected|post-specific|scope|distinct|each (?:campaign|offer|trip|destination|course|webinar|intention))/i,
  },
  boundary: {
    title: /\b(boundary|accidental|stay quiet|returning|next visit|how words match)/i,
    body: /\b(unrelated sentences|stay quiet|criticism|returning contact)/i,
    needsMatch: true,
  },
  menu: {
    title: /\b(keep the menu|link menu|each destination a purpose)/i,
    topics: ["messages"],
    needsMatch: true,
  },
  contact: {
    title: /\b(save|collect(?:s|ed|ing)?\b|collection wording|context|brief|enquir|question|ask|interest|readable|prepare (?:an|enrol)|enrol|purpose|exchange|together|partnership|joining)/i,
    body: /\b(save|store|collect|fields?|answers)\b/i,
    topics: instagram,
  },
  search: {
    title: /\b(find the|search|locate|contact record|readable contact)/i,
    body: /\b(contact search|search|field names?)\b/i,
    topics: ["leads", "team", "messages"],
    needsMatch: true,
  },
  handoff: {
    title: /\b(a person|team|human|handoff|graceful exit|place for exceptions|support personal|order support|personal|special requests|consultation|transition|inbox process|competing|urgent|custom work)/i,
    body: /\b(handoff|your team|a person|pause|path to help)/i,
    topics: instagram,
  },
  pipeline: {
    title: /\b(stages?|measure|next action|visits|journey|evidence|confirm|verified|expectation|joining process)/i,
    body: /\b(delivery|delivered|tracked|clicks?|confirmed|confirmation)\b/i,
    topics: ["insights", "team", "comments", "messages", "leads"],
    needsMatch: true,
  },
  activity: {
    title: /\b(problems?|review the whole|isolate|attention)/i,
    body: /\b(unsuccessful|variants?|inspect delivery)\b/i,
    topics: ["insights", "team"],
  },
  public: {
    title: /\b(visible|public|readers|thread|useful answers|visitors|old posts)/i,
    body: /\b(public|visitors|readers|thread|everyone)\b/i,
    topics: ["facebook"],
  },
  gate: {
    title: /\b(follow|check again|recheck|button tap)/i,
    body: /\b(follow(?:er|ing)?s?|recheck)\b/i,
    topics: ["followers"],
  },
  schedule: {
    title: /\b(window|reminder|reason recognisable|changed state|follow-?up)/i,
    body: /\b(window|remind|check-in|follow-up)/i,
    topics: ["messages", "leads"],
    needsMatch: true,
  },
  optout: {
    title: /\b(let the person stop|opt[- ]?out|unsubscribe)/i,
    body: /\b(opt-outs|repeated nudges)\b/i,
    topics: ["messages", "leads"],
    needsMatch: true,
  },
  retry: {
    title: /\b(mistakes?|retry)\b/i,
    body: /\b(retry|typo|invalid)\b/i,
    topics: ["leads"],
    needsMatch: true,
  },
};

/* When a benefit names nothing in particular, the topic's own outcomes come first. */
const preference: Record<SeoTopic, readonly OutcomeKind[]> = {
  comments: ["caption", "routes", "preview", "notify", "contact", "handoff", "pipeline"],
  messages: ["preview", "notify", "routes", "handoff", "contact", "caption", "schedule"],
  stories: ["notify", "preview", "routes", "contact", "handoff", "caption"],
  leads: ["contact", "search", "preview", "notify", "routes", "handoff", "pipeline"],
  followers: ["gate", "caption", "preview", "notify", "routes", "contact"],
  team: ["handoff", "contact", "notify", "activity", "pipeline", "preview", "routes"],
  insights: ["pipeline", "activity", "preview", "routes", "caption", "contact"],
  facebook: ["public", "routes", "preview", "notify", "caption", "boundary"],
};

const allKinds = Object.keys(rules) as OutcomeKind[];

function matchScore(kind: OutcomeKind, [title, body]: ContentBlock): number {
  const rule = rules[kind];
  return (rule.title.test(title) ? 3 : 0) + (rule.body?.test(body) ? 1 : 0);
}

/**
 * Whether another section already shows the page's caption: the example draws
 * the post, Page post or Story with its caption, and How it works draws the
 * caption in an instruction step. Then benefits picks another outcome, so the
 * same caption card never appears twice on a page.
 */
function captionShownElsewhere(page: SeoPage): boolean {
  const context = exampleContext(page);
  if (context === "post" || context === "page") return true;
  if (context === "story" && incomingFor(page).kind === "quote") return true;
  return stepKinds(page).includes("instruction");
}

function allowed(kind: OutcomeKind, page: SeoPage, benefit: ContentBlock): boolean {
  const rule = rules[kind];
  if (rule.topics && !rule.topics.includes(page.topic)) return false;
  if (kind === "caption" && ((page.topic !== "comments" && !incomingFor(page).keyword) || captionShownElsewhere(page))) return false;
  return !rule.needsMatch || matchScore(kind, benefit) > 0;
}

/**
 * One outcome per benefit, all different. Picks the assignment whose outcomes
 * the benefit titles name most strongly; ties go to the topic's preference.
 */
export function benefitOutcomes(page: SeoPage): readonly OutcomeKind[] {
  const order = preference[page.topic];
  const kinds = [...order, ...allKinds.filter((kind) => !order.includes(kind))];
  const options = page.benefits.map((benefit) => kinds
    .filter((kind) => allowed(kind, page, benefit))
    .map((kind) => ({ kind, score: matchScore(kind, benefit), rank: kinds.indexOf(kind) })));
  let best: { picks: OutcomeKind[]; score: number; rank: number } | null = null;
  const visit = (index: number, picks: OutcomeKind[], score: number, rank: number) => {
    if (index === options.length) {
      if (!best || score > best.score || (score === best.score && rank < best.rank)) best = { picks: [...picks], score, rank };
      return;
    }
    for (const option of options[index]) {
      if (picks.includes(option.kind)) continue;
      picks.push(option.kind);
      visit(index + 1, picks, score + option.score, rank + option.rank);
      picks.pop();
    }
  };
  visit(0, [], 0, 0);
  const chosen = (best as { picks: OutcomeKind[] } | null)?.picks;
  // More benefits than outcomes (never in today's content): cycle the preference.
  return chosen ?? page.benefits.map((_, index) => order[index % order.length]);
}

/* Destinations: what the link in the reply opens, named the way a page title would be. */

export type Destination = { title: string; word: string };

const destinationPhrases: readonly (readonly [RegExp, string, string])[] = [
  [/price list|package list|packages|rates|pricing|price page|service list/i, "Price list", "PRICE"],
  [/\bmenu\b/i, "Menu", "MENU"],
  [/opening hours|hours page|weekly hours|current hours|holiday closures/i, "Opening hours", "HOURS"],
  [/booking page|booking information|appointment page|booking link|booking destination|scheduling/i, "Booking page", "BOOK"],
  [/webinar/i, "Webinar registration", "WEBINAR"],
  [/registration page|event registration|event page/i, "Event registration", "EVENT"],
  [/official rules|giveaway rules|campaign rules|\brules\b/i, "Official rules", "ENTER"],
  [/shipping policy|delivery coverage|delivery page|shipping/i, "Shipping policy", "SHIPPING"],
  [/installation|service coverage/i, "Service coverage", "INSTALL"],
  [/support contact|support process|help route|support route|help page/i, "Help and support", "HELP"],
  [/size chart|sizing/i, "Size chart", "SIZE"],
  [/syllabus|course overview|course details/i, "Course overview", "COURSE"],
  [/programme/i, "Programme overview", "PROGRAMME"],
  [/itinerary/i, "Trip itinerary", "ITINERARY"],
  [/listing/i, "Listing details", "LISTING"],
  [/episode|show notes/i, "Full episode", "EPISODE"],
  [/template pack/i, "Template pack", "TEMPLATE"],
  [/preset/i, "Preset download", "PRESET"],
  [/package overview/i, "Package overview", "SHOOT"],
  [/signup|subscri|weekly letter|newsletter/i, "Newsletter signup", "NEWSLETTER"],
  [/offer/i, "Offer details", "OFFER"],
  [/checklist/i, "Launch checklist", "CHECKLIST"],
  [/freebie/i, "Free resource", "FREEBIE"],
  [/guide/i, "Free guide", "GUIDE"],
  [/product|shirt|\bbag\b|\bitem\b|outfit|\blook\b/i, "Product page", "SHOP"],
  [/launch/i, "Launch details", "LAUNCH"],
  [/resources?/i, "Starter resources", "START"],
];

const buttonVerb = /^(open|see|view|get|read|shop|explore|book|browse|watch|download|claim|start|visit|try|listen|join|register|subscribe)\s+(?:the\s+|your\s+|our\s+)?/i;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

function replyText(page: SeoPage): string {
  const reply = replyFor(page);
  return reply.kind === "variants" ? reply.variants.map((variant) => variant.text).join(" ") : reply.text;
}

function phraseIn(text: string) {
  return destinationPhrases.find(([pattern]) => pattern.test(text));
}

/** The page the reply links to: "View packages" opens "Packages"; a described reply is read for its destination. */
export function destinationFor(page: SeoPage): Destination {
  const next = nextFor(page);
  const phrase = phraseIn(`${page.example.next} ${replyText(page)} ${page.example.incoming}`);
  const word = incomingFor(page).keyword ?? phrase?.[2] ?? "INFO";
  if (next.kind === "button") {
    const name = next.label.replace(buttonVerb, "").replace(/\s+link$/i, "").trim();
    if (name && name.split(/\s+/).length <= 3) return { title: capitalise(name), word };
  }
  return { title: phrase?.[1] ?? "Resource page", word };
}

/* Specific enough that a benefit naming one means that page, not the page's own resource. */
const specificWords = new Set(["PRICE", "MENU", "HOURS", "BOOK", "EVENT", "WEBINAR", "ENTER", "SHIPPING", "INSTALL", "HELP", "SIZE", "COURSE", "PROGRAMME", "ITINERARY", "LISTING", "EPISODE"]);

/** The destination a benefit talks about ("a size chart", "your support process"), else the page's own. */
export function benefitDestination(page: SeoPage, [title, body]: ContentBlock): Destination {
  const own = destinationFor(page);
  const named = phraseIn(title) ?? phraseIn(body);
  const ownPhrase = phraseIn(`${page.example.next} ${replyText(page)} ${page.example.incoming}`);
  if (!named || !specificWords.has(named[2]) || named[1] === own.title || named[2] === own.word || named[1] === ownPhrase?.[1]) return own;
  return { title: named[1], word: named[2] };
}

/** Every destination a reply names, in order: a link menu's buttons. */
export function menuItems(page: SeoPage): readonly string[] {
  const text = replyText(page);
  const found = destinationPhrases
    .map(([pattern, title]) => ({ title, at: text.search(pattern) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((item) => item.title);
  const items = [...new Set(found)];
  return items.length >= 2 ? items.slice(0, 3) : ["Price list", "Booking page", "Help and support"];
}

/** "Price list" becomes yourbrand.com/price-list. */
export function destinationPath(title: string): string {
  return `yourbrand.com/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

/* A second campaign for the "right post, right link" picture, never the page's own. */
export type Campaign = Destination & { post: string };

const otherCampaigns: readonly Campaign[] = [
  { word: "GUIDE", title: "Free guide", post: "Tutorial Reel" },
  { word: "SHOP", title: "Product page", post: "Launch post" },
  { word: "BOOK", title: "Booking page", post: "Services post" },
  { word: "ENTER", title: "Official rules", post: "Giveaway post" },
];

/** Facebook Pages run giveaways beside launches, so the giveaway is their usual second campaign. */
export function otherCampaign(own: Destination, topic?: SeoTopic): Campaign {
  const order = topic === "facebook" ? [otherCampaigns[3], otherCampaigns[1], otherCampaigns[0]] : otherCampaigns;
  return order.find((campaign) => campaign.word !== own.word && campaign.title !== own.title) ?? order[0];
}

/** The post a campaign word belongs to: LAUNCH runs on a launch post, ENTER on a giveaway post. */
export function campaignPost(word: string): string {
  return otherCampaigns.find((campaign) => campaign.word === word)?.post ?? (word === "LAUNCH" ? "Launch post" : "This post");
}

/** Where the request came from, in the words the app uses. */
export function sourceLabel(page: SeoPage): string {
  switch (page.topic) {
    case "comments": case "followers": return "Comment on a Reel";
    case "stories": return incomingFor(page).kind === "event" ? "Story mention" : "Story reply";
    case "facebook": return "Page comment";
    default: return "Message";
  }
}

/** Does the journey collect an email address? */
export function collectsEmail(page: SeoPage): boolean {
  return /\bemail\b/i.test(`${page.example.reply} ${page.example.next}`);
}

/** Pipeline pictures: delivery and visits for insight benefits, otherwise what still needs confirming. */
export function pipelineMode(page: SeoPage, [, body]: ContentBlock): "journey" | "status" {
  return page.topic === "insights" || /\b(tracked|clicks?|visits?)\b/i.test(body) ? "journey" : "status";
}
