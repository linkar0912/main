import type { CSSProperties } from "react";
import { getSeoPages, type SeoCollection, type SeoPage, type SeoTopic } from "@/src/content/seo";
import { detailLayout, fnv1a, mulberry32, type DetailLayout } from "./seo-layout";

/** Fixed colours. Saturated blocks keep these in dark mode with their own ink. */
export const seoPalette = {
  yellow: "#fff100",
  lilac: "#e4d4ff",
  pinkTint: "#ffd6fb",
  hotMagenta: "#fa0cf7",
  ctaMagenta: "#c200bf",
  ink: "#101116",
  navy: "#2b3a67",
  mint: "#c8f0dc",
  sky: "#cfe8ff",
  white: "#ffffff",
  /** The "Your Page" avatar on every Facebook mock. */
  pageBlue: "#1f4fd1",
} as const;

export type SeoTone = "yellow" | "lilac" | "pinkTint" | "mint" | "sky";

/** Light panel tones in the order cards cycle through them. */
export const seoToneCycle: readonly SeoTone[] = ["yellow", "lilac", "pinkTint", "mint", "sky"];

export function seoToneAt(index: number): SeoTone {
  return seoToneCycle[((index % seoToneCycle.length) + seoToneCycle.length) % seoToneCycle.length];
}

type Three<T> = readonly [T, T, T];

export type TopicVisual = {
  /** Dark enough for white text: every hero carries the white header ink. */
  accent: string;
  channel: string;
  trigger: string;
  sent: string;
  /** Overview headlines. `topicLine(page, "inboxTitles")` picks one per page. */
  inboxTitles: Three<string>;
  /** Lines over the full-width photo extra. Never an overview headline. */
  statementLines: Three<string>;
  /** The before and after extra's heading: the problem, then the turn. */
  compareTitles: Three<readonly [problem: string, turn: string]>;
  /** Benefits headlines, one per page. */
  benefitsTitles: Three<string>;
  /** How it works headlines on features and solutions (recipes use `recipeTitles`). */
  stepsTitles: Three<string>;
  /** Example conversation headlines. */
  exampleTitles: Three<string>;
  /** Trigger setup options: the selected one first. `triggerScope(page)` refines it per page. */
  scope: readonly [selected: string, other: string];
  /** Illustrative names for mock UI only. */
  handles: readonly [string, string, string];
};

/*
 * Headline copy is honest and short: no numbers, no promises the topic guides
 * do not make, and no "once" (the final call to action owns that word). Each
 * topic has three of each so pages on the same topic in one collection read
 * differently. Lines stay true for every page on the topic: the team lines
 * also fit an agency page that hands nothing over, and the stories lines fit
 * mention pages as well as reply pages.
 */
export const topicVisuals: Record<SeoTopic, TopicVisual> = {
  comments: {
    accent: "#5f2ce0", channel: "Instagram", trigger: "Comment on a post or Reel", sent: "Private reply sent",
    inboxTitles: [
      "Every comment is a request. Answer it while it’s fresh.",
      "People ask in the comments. Send what they asked for.",
      "A comment is a raised hand. Reply to it in private.",
    ],
    statementLines: [
      "Nobody should have to comment twice.",
      "What they asked for, waiting in their DMs.",
      "A busy post should not mean a slow reply.",
    ],
    compareTitles: [
      ["Comments keep arriving.", "Your answers can keep up."],
      ["Your post did its job.", "Now let the reply do its job."],
      ["Popular posts get loud.", "Matching requests still hear back."],
    ],
    benefitsTitles: [
      "Busy comment sections, calm replies.",
      "Built for the way people actually ask.",
      "The right reply for the post they saw.",
    ],
    stepsTitles: [
      "What it takes to set it up.",
      "From a comment to the right reply.",
      "How the comment reply comes together.",
    ],
    exampleTitles: [
      "Watch one comment get its reply.",
      "One comment, followed all the way.",
      "What the person who commented sees.",
    ],
    scope: ["A specific post or Reel", "Any post or Reel"], handles: ["aanya.makes", "rohit.codes", "meera.bakes"],
  },
  messages: {
    accent: "#c200bf", channel: "Instagram", trigger: "Incoming DM", sent: "Reply sent",
    inboxTitles: [
      "The same questions arrive every day. Answer them consistently.",
      "Your DMs ask the same things. Keep the answers ready.",
      "You’ve answered this DM before. Let the answer go out again.",
    ],
    statementLines: [
      "Consistent answers build quiet trust.",
      "Your inbox should not depend on your memory.",
      "Save your typing for the questions that need you.",
    ],
    compareTitles: [
      ["Typing is not the job.", "Answering well is."],
      ["Every reply typed from scratch.", "Or one you prepared and tested."],
      ["Busy days make for short replies.", "Prepared ones stay complete."],
    ],
    benefitsTitles: [
      "Built for the inbox you actually have.",
      "Familiar questions, careful answers.",
      "Helpful answers, and a person when it matters.",
    ],
    stepsTitles: [
      "Prepare the answer before the question arrives.",
      "From a repeat question to a prepared answer.",
      "Set up the answer, then test it.",
    ],
    exampleTitles: [
      "Watch one question get its answer.",
      "One message, followed all the way.",
      "What the person who asked sees.",
    ],
    scope: ["Messages containing a keyword", "Any first message"], handles: ["kabir.studio", "isha.shops", "dev.travels"],
  },
  stories: {
    accent: "#b8235a", channel: "Instagram", trigger: "Story reply or mention", sent: "Story reply answered",
    inboxTitles: [
      "Stories start conversations. Answer while they’re warm.",
      "Stories don’t stay up for long. Reply while they do.",
      "Answer Story replies and mentions in the moment.",
    ],
    statementLines: [
      "A Story reply is an open door.",
      "Someone answered your Story. That’s your cue.",
      "Every Story is a small invitation to talk.",
    ],
    compareTitles: [
      ["A Story disappears.", "The request shouldn’t."],
      ["Replies arrive while you’re busy.", "Answers don’t have to wait for you."],
      ["People talk back to Stories.", "Be ready to answer."],
    ],
    benefitsTitles: [
      "Built for the way people answer Stories.",
      "Short-lived Stories, useful answers.",
      "Mentions and replies, never mixed up.",
    ],
    stepsTitles: [
      "Here’s how to set it up.",
      "From a Story to a fitting reply.",
      "Set up the Story trigger and the reply.",
    ],
    exampleTitles: [
      "See the reply in context.",
      "One Story moment, followed through.",
      "What the person on the other side sees.",
    ],
    scope: ["Replies to a specific Story", "Any Story reply"], handles: ["tara.moves", "neel.eats", "sana.styles"],
  },
  leads: {
    accent: "#0e7a55", channel: "Instagram", trigger: "Enquiry in a conversation", sent: "Details saved",
    inboxTitles: [
      "Interest fades fast. Capture it inside the chat.",
      "Good leads start with a clear question. Ask it in the DM.",
      "Ask for the details while they’re still talking to you.",
    ],
    statementLines: [
      "An enquiry is only as useful as its details.",
      "Say why you’re asking. Then ask.",
      "Collect only what helps your next reply.",
    ],
    compareTitles: [
      ["Enquiries arrive half finished.", "The conversation fills in the rest."],
      ["A name is not a lead.", "Context is."],
      ["Details asked for later get lost.", "Ask while the chat is open."],
    ],
    benefitsTitles: [
      "Built for the details you need next.",
      "Ask for less, and ask it well.",
      "Enquiries that are ready to continue.",
    ],
    stepsTitles: [
      "Set up the enquiry journey.",
      "From a first message to a useful enquiry.",
      "How the enquiry journey comes together.",
    ],
    exampleTitles: [
      "See the conversation in context.",
      "One enquiry, followed through.",
      "What the person enquiring sees.",
    ],
    scope: ["Messages containing a keyword", "Any first message"], handles: ["ankit.fit", "riya.designs", "vikram.home"],
  },
  followers: {
    accent: "#c2410c", channel: "Instagram", trigger: "Comment with a follow check", sent: "Follow status checked",
    inboxTitles: [
      "Say the follower rule upfront. Deliver when it’s met.",
      "Ask for the follow openly. Linkar checks it in the chat.",
      "Make a followers-only offer feel fair from the start.",
    ],
    statementLines: [
      "Followers first, with no fine print.",
      "A clear check, then the thing they asked for.",
      "Not following yet? Give them a clear next step.",
    ],
    compareTitles: [
      ["Surprise conditions lose trust.", "A clear follower check keeps it."],
      ["A follow is a small ask.", "Make it an honest one."],
      ["Checking follows by hand is slow.", "The journey can check for you."],
    ],
    benefitsTitles: [
      "Built for a follower rule people can trust.",
      "Fair to followers, clear to everyone else.",
      "No surprises between the comment and the resource.",
    ],
    stepsTitles: [
      "Here’s how to set it up.",
      "From a request to the resource.",
      "How the follower offer comes together.",
    ],
    exampleTitles: [
      "See the reply in context.",
      "One request, followed all the way.",
      "What the person who asked sees.",
    ],
    scope: ["A specific post or Reel", "Any post or Reel"], handles: ["zoya.reads", "arjun.lifts", "pooja.paints"],
  },
  team: {
    accent: seoPalette.navy, channel: "Instagram", trigger: "Message that needs a person", sent: "Handed to your team",
    inboxTitles: [
      "Some messages need a person. Hand them over cleanly.",
      "Automation answers the routine. Your team takes the rest.",
      "Complaints and custom requests deserve a person.",
    ],
    statementLines: [
      "The best handoff feels like one conversation.",
      "Nobody should have to repeat their question.",
      "Your team picks up where the chat left off.",
    ],
    compareTitles: [
      ["Some questions need judgement.", "Give them to a person, with context."],
      ["Automation should know its limits.", "Yours can step aside."],
      ["Handoffs go wrong in the gaps.", "Keep the whole thread together."],
    ],
    benefitsTitles: [
      "Built for a calm, accountable inbox.",
      "Clear roles for automation and your team.",
      "People where judgement is needed.",
    ],
    stepsTitles: [
      "Here’s how to set it up.",
      "Set it up with your team in mind.",
      "How the workflow comes together.",
    ],
    exampleTitles: [
      "See the reply in context.",
      "One conversation, followed through.",
      "What the person on the other side sees.",
    ],
    scope: ["Messages asking for a person", "Any unmatched message"], handles: ["nikhil.events", "asha.clinic", "farhan.cafe"],
  },
  insights: {
    accent: "#0b5c7a", channel: "Instagram", trigger: "Resource request", sent: "Activity recorded",
    inboxTitles: [
      "See what each automation actually did.",
      "Know what happened after each reply.",
      "Matches, deliveries and visits. Read each on its own.",
    ],
    statementLines: [
      "Decide from activity, not a hunch.",
      "Change one thing at a time. Then compare.",
      "Read the activity before you rewrite the reply.",
    ],
    compareTitles: [
      ["A single total hides the story.", "Each automation has its own."],
      ["Busy is not the same as working.", "Activity shows the difference."],
      ["Every change tempts a conclusion.", "Wait for enough activity to tell."],
    ],
    benefitsTitles: [
      "Built for decisions you can explain.",
      "Know what worked before you change it.",
      "Evidence first, then the next change.",
    ],
    stepsTitles: [
      "Here’s how to set it up.",
      "From activity to a clear next step.",
      "How the reporting comes together.",
    ],
    exampleTitles: [
      "See the reply in context.",
      "One request, followed through.",
      "What happens after the reply.",
    ],
    scope: ["Messages containing a keyword", "Comments on a selected post"], handles: ["kiran.learns", "maya.makes", "omar.builds"],
  },
  facebook: {
    accent: "#1f4fd1", channel: "Facebook Page", trigger: "Comment on a Page post", sent: "Public reply posted",
    inboxTitles: [
      "Questions under your posts deserve a public answer.",
      "Answer in the thread, where everyone reading can see it.",
      "Page comments ask real questions. Reply where they asked.",
    ],
    statementLines: [
      "Your comment section is a public FAQ.",
      "A good public reply reads well to strangers too.",
      "Keep private details out of public threads.",
    ],
    compareTitles: [
      ["The same question under every post.", "Ready answers for the whole thread."],
      ["Unanswered comments look like silence.", "A public reply shows you listened."],
      ["Questions arrive after closing time.", "Answers can still go out."],
    ],
    benefitsTitles: [
      "Built for comment sections people read.",
      "Answers that hold up in public.",
      "Helpful to the next person reading too.",
    ],
    stepsTitles: [
      "What it takes to answer in public.",
      "From a Page comment to a public answer.",
      "How the public reply comes together.",
    ],
    exampleTitles: [
      "See the public reply in context.",
      "One comment, answered where it was asked.",
      "What everyone reading the thread sees.",
    ],
    scope: ["A specific Page post", "Any Page post"], handles: ["Priya S.", "Rahul M.", "Anita K."],
  },
};

/** How it works on recipes: the same lines for every topic, dealt per topic like the topic lines. */
export const recipeTitles: readonly string[] = [
  "Make this recipe your own.",
  "Adapt the recipe to your account.",
  "Swap in your details, then test.",
  "Copy the recipe, then make it fit.",
  "Use the recipe as your starting point.",
];

export type TopicLineField = "inboxTitles" | "statementLines" | "compareTitles" | "benefitsTitles" | "stepsTitles" | "exampleTitles";
type TopicLine<F extends TopicLineField> = TopicVisual[F][number];

/** Which pages show each field: the overview, benefits, steps and example are on every page, the extras only where the layout places them. */
const showsField: Record<TopicLineField, (layout: DetailLayout) => boolean> = {
  inboxTitles: () => true,
  statementLines: (layout) => layout.extras.includes("photo"),
  compareTitles: (layout) => layout.extras.includes("compare"),
  benefitsTitles: () => true,
  stepsTitles: () => true,
  exampleTitles: () => true,
};

const seededDraw = (key: string) => mulberry32(fnv1a(key))();

/**
 * Which of `count` lines a page gets, by the same FNV-1a seed as the layout
 * engine with a salt per field. Pages on the same topic in one collection that
 * show the field are ranked by their draw and dealt the lines in turn from a
 * seeded start, so up to three such pages never share a line and larger groups
 * share them evenly. Every field but the overview ranks pages by their overview
 * line first, so pages that share an overview headline get different lines
 * elsewhere. Pure: the same page always gets the same line.
 */
function seededLineIndex(page: SeoPage, salt: string, count: number, shows: (layout: DetailLayout) => boolean): number {
  const group = getSeoPages(page.collection).filter((candidate) => candidate.topic === page.topic && candidate.slug !== page.slug && shows(detailLayout(candidate)));
  const ranked = [...group, page]
    .map((candidate) => ({
      slug: candidate.slug,
      overview: salt === "inboxTitles" ? 0 : topicLineIndex(candidate, "inboxTitles"),
      draw: seededDraw(`${candidate.collection}/${candidate.slug}:${salt}`),
    }))
    .sort((a, b) => a.overview - b.overview || a.draw - b.draw || a.slug.localeCompare(b.slug));
  const start = Math.floor(seededDraw(`${page.collection}:${page.topic}:${salt}`) * count);
  return (start + ranked.findIndex((entry) => entry.slug === page.slug)) % count;
}

function topicLineIndex(page: SeoPage, field: TopicLineField): number {
  return seededLineIndex(page, field, topicVisuals[page.topic][field].length, showsField[field]);
}

/** The page's line for a field: its overview, benefits, steps or example headline, photo statement or before and after heading. */
export function topicLine<F extends TopicLineField>(page: SeoPage, field: F): TopicLine<F> {
  return (topicVisuals[page.topic][field] as readonly TopicLine<F>[])[topicLineIndex(page, field)];
}

/** How it works headline: a topic line on features and solutions, a recipe line on templates. */
export function stepsTitle(page: SeoPage): string {
  if (page.collection !== "templates") return topicLine(page, "stepsTitles");
  return recipeTitles[seededLineIndex(page, "recipeTitles", recipeTitles.length, () => true)];
}

/** Short names for compact topic filters; the full label stays as each group's heading. */
export const topicShortLabels: Record<SeoTopic, string> = {
  comments: "Comments", messages: "Messages", stories: "Stories", leads: "Leads",
  followers: "Followers", team: "Team", insights: "Insights", facebook: "Facebook",
};

export const collectionAccents: Record<SeoCollection, string> = {
  features: "#5f2ce0",
  solutions: "#c200bf",
  templates: "#0e7a55",
};

/** Topics whose trigger is a comment under a post, so mock UI shows a comment thread. */
export function isCommentTopic(topic: SeoTopic): boolean {
  return topic === "comments" || topic === "followers" || topic === "facebook";
}

/*
 * Light tints of an accent for panels behind ink text, where mixing the accent
 * with white would come out grey (navy, teal), sage (green) or too close to the
 * lilac panel (violet). Accents not listed mix in CSS. Soft accents are for
 * accent-coloured text on the dark theme, where the mix turns navy and teal grey.
 */
const accentTints: Record<string, string> = {
  "#5f2ce0": seoPalette.pinkTint,
  "#c200bf": seoPalette.pinkTint,
  "#b8235a": seoPalette.pinkTint,
  "#0e7a55": seoPalette.mint,
  [seoPalette.navy]: seoPalette.sky,
  "#0b5c7a": seoPalette.mint,
};
const accentSofts: Record<string, string> = {
  [seoPalette.navy]: "#a9bcff",
  "#0b5c7a": "#7fd6f0",
};

export type SeoAccentStyle = CSSProperties & {
  "--seo-accent": string;
  "--seo-on-accent": string;
  /** A light panel tint of the accent, never grey. CSS falls back to a mix when absent. */
  "--seo-accent-tint"?: string;
  /** The accent as text on the dark theme. CSS falls back to a mix when absent. */
  "--seo-accent-soft"?: string;
};

export function seoAccentStyle(accent: string): SeoAccentStyle {
  const key = accent.trim().toLowerCase();
  const style: SeoAccentStyle = { "--seo-accent": accent, "--seo-on-accent": seoPalette.white };
  if (accentTints[key]) style["--seo-accent-tint"] = accentTints[key];
  if (accentSofts[key]) style["--seo-accent-soft"] = accentSofts[key];
  return style;
}

export function topicAccentStyle(topic: SeoTopic): SeoAccentStyle {
  return seoAccentStyle(topicVisuals[topic].accent);
}

export function collectionAccentStyle(collection: SeoCollection): SeoAccentStyle {
  return seoAccentStyle(collectionAccents[collection]);
}

export type FinalCtaTone = "magenta" | "yellow";

/** Hot magenta by default; yellow next to the plum and raspberry accents so two magentas never meet. */
export function finalCtaTone(accent: string): FinalCtaTone {
  const value = accent.trim().toLowerCase();
  return value === seoPalette.ctaMagenta || value === "#b8235a" ? "yellow" : "magenta";
}

/** "GUIDE" is one word; "GUIDE please" and "Can I see your menu?" are not. */
export function isSingleWord(text: string): boolean {
  const value = text.trim();
  return value.length > 0 && !/\s/.test(value);
}

/** A typed keyword such as "MENU" or "WEEKEND COURSE": short and all capitals. */
export function isKeyword(text: string): boolean {
  const value = text.trim();
  return /[A-Z]/.test(value) && value === value.toUpperCase() && value.split(/\s+/).length <= 3;
}
