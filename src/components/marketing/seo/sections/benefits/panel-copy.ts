import type { SeoPage, SeoTopic } from "@/src/content/seo";
import type { ContentBlock } from "@/src/content/seo/types";
import { incomingFor, nextFor } from "../../seo-example";
import { benefitDestination, destinationFor, destinationPath, type Destination } from "./outcomes";

/*
 * The words on the large benefit panels (zigzag rows, the icon list's tall
 * panel): which page a link card opens and what it lists, and which routes a
 * routes card draws. Pure, so a script can read every page's copy.
 */

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The benefit's body without what it rules out ("rather than a menu", "should not receive the free guide"). */
export function positiveBody(body: string): string {
  return body
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/,?\s*\b(?:rather than|instead of|not|never|without|avoid)\b.*$/i, ""))
    .filter(Boolean)
    .join(" ");
}

/* ---------- Preview: the page the reply opens ---------- */

/**
 * The page a link card shows: the one the benefit asks for, read without the
 * clauses it rules out, so "rather than ... a menu" never draws a menu. Null
 * when the reply links to no page at all (a thank-you with a personal follow-up).
 */
export function previewDestination(page: SeoPage, [title, body]: ContentBlock): Destination | null {
  const destination = benefitDestination(page, [title, positiveBody(body)]);
  return destination.title === "Resource page" && nextFor(page).kind !== "button" ? null : destination;
}

/* Page sections a benefit or reply can name, shown as tags on the link card's cover. */
const sectionWords: readonly (readonly [RegExp, string])[] = [
  [/\bshade options?\b/i, "Shade options"], [/\bingredients?\b/i, "Ingredients"], [/\bavailability\b/i, "Availability"],
  [/\bsizes\b/i, "Sizes"], [/\bmeasurements\b/i, "Measurements"], [/\bcolou?rs\b/i, "Colours"],
  [/\bprices\b/i, "Prices"], [/\bstock\b/i, "Stock"], [/\bmodules\b/i, "Modules"], [/\bformat\b/i, "Format"],
  [/\bprerequisites\b/i, "Prerequisites"], [/\blocation\b/i, "Location"], [/\bremote options\b/i, "Remote options"],
  [/\bjoining steps\b/i, "Joining steps"], [/\bholiday\b/i, "Holiday updates"], [/\bcoverage\b/i, "Coverage"],
  [/\bcharges\b/i, "Charges"], [/\btimeframes\b/i, "Timeframes"], [/\bpackages?\b/i, "Packages"],
  [/\bwhat[’']s included\b/i, "What’s included"], [/\bdates\b/i, "Dates"], [/\bconditions\b/i, "Conditions"],
  [/\bdeadline\b/i, "Deadline"], [/\bterms\b/i, "Terms"], [/\bend date\b/i, "End date"], [/\bclosing date\b/i, "Closing date"],
  [/\brequirements\b/i, "Requirements"], [/\bwinner\b/i, "Winner selection"], [/\bhours\b/i, "Opening hours"],
  [/\bdelivery (?:details|information)\b/i, "Delivery details"],
];

function sectionsIn(text: string): string[] {
  return sectionWords
    .map(([pattern, label]) => ({ label, at: text.search(pattern) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((item) => item.label);
}

/**
 * What the linked page holds, in the page's own words: the benefit's list
 * first, then the reply's when the card shows the reply's own page and the
 * reply describes one page rather than a menu of several. At most three.
 */
export function pageSections(page: SeoPage, [, body]: ContentBlock, destination: Destination): readonly string[] {
  const fromReply = destination.title === destinationFor(page).title && namedCampaigns(page.example.reply).length <= 1
    ? sectionsIn(page.example.reply) : [];
  const title = destination.title.toLowerCase();
  return [...new Set([...sectionsIn(positiveBody(body)), ...fromReply])]
    .filter((label) => !title.includes(label.toLowerCase()) && !label.toLowerCase().includes(title))
    .slice(0, 3);
}

/* ---------- Routes: each word keeps its own reply ---------- */

type Campaign = { word: string; title: string; post: string; team?: boolean; match: RegExp };

/* Campaigns a benefit or page can name. Order breaks ties between matches at the same place. */
const campaigns: readonly Campaign[] = [
  { word: "PRICE", title: "Price list", post: "Packages post", match: /\bprice\b|price list|\bpackages\b|\brates\b/i },
  { word: "BOOK", title: "Booking page", post: "Services post", match: /\bbook(?:ing)?\b|appointment/i },
  { word: "HOURS", title: "Opening hours", post: "Hours update", match: /\bhours\b/i },
  { word: "HELP", title: "Help and support", post: "Support post", match: /\bsupport process\b|\bsupport\b(?! team)|\bhelp page\b/i },
  { word: "SIZE", title: "Size chart", post: "Fit guide Reel", match: /size chart|\bsizing\b/i },
  { word: "SHIPPING", title: "Shipping policy", post: "Delivery post", match: /\bshipping\b|delivery (?:page|coverage)/i },
  { word: "ORDER", title: "Order support", post: "Order help", team: true, match: /existing order|order-specific|order support/i },
  { word: "COURSE", title: "Course overview", post: "Course Reel", match: /\bcourses?\b|\bsyllabus\b/i },
  { word: "ENTER", title: "Giveaway rules", post: "Giveaway post", match: /\bgiveaway\b/i },
  { word: "GUIDE", title: "Free guide", post: "Tutorial Reel", match: /free-guide|free guide|free resource|\bguide\b/i },
  { word: "NEW", title: "New collection", post: "Launch post", match: /new collection|launch campaign/i },
  { word: "SHOP", title: "Product page", post: "Launch post", match: /product launch|\bproducts\b|featured item|product page/i },
  { word: "LOOK", title: "Shop the look", post: "Outfit Reel", match: /\blooks?\b|\boutfits?\b/i },
  { word: "WEEKEND", title: "Weekend cohort", post: "Weekend post", match: /\bweekend\b/i },
  { word: "WEEKDAY", title: "Weekday cohort", post: "Weekday post", match: /\bweekday\b/i },
  { word: "APPLY", title: "Application page", post: "Admissions post", match: /\bapplication\b|\benrol(?:l)?ment\b/i },
  { word: "DEAL", title: "Offer details", post: "Offer Story", match: /\bDEAL\b|\bsale\b|\bdiscount\b/ },
];

/** Every campaign a text names, in the order it names them. */
function namedCampaigns(text: string): readonly Campaign[] {
  return campaigns
    .map((campaign, rank) => ({ campaign, rank, at: text.search(campaign.match) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at || a.rank - b.rank)
    .map((item) => item.campaign);
}

/* When neither the benefit nor the page names a second campaign: the topic's usual ones. */
const fallbackWords: Record<SeoTopic, readonly string[]> = {
  comments: ["GUIDE", "SHOP", "ENTER", "BOOK"],
  followers: ["GUIDE", "SHOP", "ENTER"],
  stories: ["DEAL", "LOOK", "GUIDE"],
  messages: ["PRICE", "BOOK", "HELP"],
  leads: ["BOOK", "COURSE", "PRICE"],
  facebook: ["HOURS", "PRICE", "HELP"],
  team: ["GUIDE", "SHOP", "BOOK"],
  insights: ["GUIDE", "SHOP", "BOOK"],
};

const byWord = (word: string) => campaigns.find((campaign) => campaign.word === word)!;

/** Where a route ends: a page link, your team, or nowhere (the automation stays quiet). */
export type RouteTo = "link" | "team" | "quiet";
export type Route = { source: string; word: string; destination: string; to: RouteTo };
type Own = Destination & { to: RouteTo };

/**
 * The page's own route. A reply with no page behind it goes to your team
 * ("Save the proposal for review" becomes "Proposal for review"), and a page
 * named only by its keyword ("LOOK", "Look") keeps its button's words.
 */
function ownRoute(page: SeoPage): Own {
  const own = destinationFor(page);
  const next = nextFor(page);
  if (own.title === "Resource page") {
    const handed = next.kind === "note" ? next.label.replace(/^(?:save|keep|send|invite)\s+(?:the\s+)?/i, "") : "";
    return { ...own, title: handed ? capitalise(handed) : "Your team", to: "team" };
  }
  if (own.title.toLowerCase() === own.word.toLowerCase() && next.kind === "button") return { ...own, title: next.label, to: "link" };
  return { ...own, to: "link" };
}

/* A benefit about which posts may answer: the same word elsewhere stays quiet. */
const scoping = /\belsewhere\b|every Page update|normal Page comment|\bold(?:er)? (?:\w+ )?posts?\b|unrelated posts?\b|other posts/i;

/** A benefit about triggers (a comment, a Story reply, a DM) rather than words. */
export function routesByTrigger([, body]: ContentBlock): boolean {
  return /story repl\w*.*\b(dm|message)/i.test(body);
}

type Pick = { kind: "own" | "other" | "quiet"; campaign: Campaign | null };

/** Where each row's request comes from, in the words the app uses for the topic. */
function sourceLabel(page: SeoPage, pick: Pick, index: number, posts: boolean, text: string, ownWord: string): string {
  switch (page.topic) {
    case "comments": case "followers":
      if (pick.kind === "quiet") return /\bold/i.test(text) ? "Older posts" : "Other posts";
      if (pick.kind === "own") return ownWord === "ENTER" ? "Giveaway post" : "This Reel";
      return pick.campaign?.post ?? "Another Reel";
    case "stories":
      if (pick.kind === "quiet") return "Other Stories";
      return ["Today’s Story", "Earlier Story", "Older Story"][index] ?? "Earlier Story";
    case "facebook":
      if (pick.kind === "quiet") return "Other Page posts";
      if (!posts) return "Comment says";
      return pick.kind === "own" ? "Selected post" : pick.campaign?.post ?? "Another post";
    case "team": return `Client ${String.fromCharCode(65 + index)}`;
    case "insights": return "Campaign";
    case "messages": return "DM says";
    default: return "Message says";
  }
}

/**
 * The routes a benefit draws, at most `max`. The page's own route, then the
 * campaigns the benefit names (including the ones it says must stay
 * separate), a quiet row when the benefit is about which posts may answer,
 * then campaigns named elsewhere on the page, and only to reach two rows, the
 * topic's usual ones. When the benefit spells out two other keywords but not
 * the page's own, its two lead. A benefit about triggers always draws all three.
 */
export function routeRows(page: SeoPage, benefit: ContentBlock, max: number): readonly Route[] {
  const own = ownRoute(page);
  const ownRow = (source: string): Route => ({ source, word: own.word, destination: own.title, to: own.to });
  const linkRow = (source: string, campaign: Campaign): Route => ({ source, word: campaign.word, destination: campaign.title, to: campaign.team ? "team" : "link" });
  if (routesByTrigger(benefit)) {
    const [first, second] = own.word === "GUIDE" || own.word === "DEAL" ? [byWord("SHOP"), byWord("ENTER")] : [byWord("GUIDE"), byWord("DEAL")];
    // One row per trigger: the three always show together.
    return [linkRow("Reel comment", first), linkRow("Story reply", second), ownRow("Incoming DM")];
  }

  const text = `${benefit[0]} ${benefit[1]}`;
  const distinct = (campaign: Campaign) => !own.word.includes(campaign.word) && campaign.title !== own.title;
  const named = namedCampaigns(text).filter(distinct);
  const ownCampaign = campaigns.find((campaign) => campaign.word === own.word);
  // The page's own route leads unless the benefit spells out two other keywords ("PRICE ... while BOOK ...").
  const spelled = named.filter((campaign) => new RegExp(`\\b${campaign.word}\\b`).test(text));
  const ownNamed = new RegExp(`\\b${own.word}\\b`).test(text) || (ownCampaign?.match.test(text) ?? false) || spelled.length < 2;
  const posts = /\bposts?\b|\breel\b|\bmedia\b|\bcampaign\b/i.test(text);

  const others: Pick[] = named.map((campaign) => ({ kind: "other", campaign }));
  const picked: Pick[] = ownNamed ? [{ kind: "own", campaign: null }, ...others] : [...others, { kind: "own", campaign: null }];
  if (scoping.test(text)) {
    if (picked.length < max) picked.push({ kind: "quiet", campaign: null });
    else if (max >= 3) picked.splice(max - 1, 0, { kind: "quiet", campaign: null });
  }
  const used = new Set(picked.map((item) => item.campaign?.word));
  const add = (campaign: Campaign, cap: number) => {
    if (picked.length >= cap || used.has(campaign.word) || !distinct(campaign)) return;
    used.add(campaign.word);
    picked.push({ kind: "other", campaign });
  };
  const rest = page.benefits.filter((other) => other !== benefit).flat().concat(page.example.reply, page.example.next).join(" ");
  for (const campaign of namedCampaigns(rest)) add(campaign, max);
  for (const word of fallbackWords[page.topic]) add(byWord(word), Math.min(max, 2));

  // On posts, the quiet row holds back the newer campaign; on a word, the page's own.
  const quietAt = picked.findIndex((item) => item.kind === "quiet");
  const newer = picked.slice(0, Math.max(quietAt, 0)).reverse().find((item) => item.kind === "other")?.campaign?.word;
  return picked.slice(0, max).map((item, index): Route => {
    const source = sourceLabel(page, item, index, posts, text, own.word);
    if (item.kind === "own") return ownRow(source);
    if (item.kind === "quiet") return { source, word: newer && posts && page.topic !== "facebook" ? newer : own.word, destination: "Stays quiet", to: "quiet" };
    return linkRow(source, item.campaign!);
  });
}

/* ---------- Notify: the answer has arrived ---------- */

/**
 * The notification's line, in the words Instagram uses for what the person
 * did. A Story benefit names its own trigger (a mention, or a reply to the
 * Story), which wins over the page's usual one.
 */
export function arrivedLine(page: SeoPage, [title, body]: ContentBlock): string {
  if (page.topic === "stories") {
    const text = `${title} ${body}`;
    if (/\bmention/i.test(text)) return "Replied to your Story mention";
    if (/\bstory repl/i.test(text)) return "Answered your Story reply";
    return incomingFor(page).kind === "event" ? "Replied to your Story mention" : "Answered your Story reply";
  }
  if (page.topic === "comments" || page.topic === "followers") return "Replied to your comment";
  return "Sent you a message";
}

/* What a store page holds, in the benefit's words (singular, as people write them). */
const storeWords: readonly (readonly [RegExp, string])[] = [
  [/\bcolou?rs?\b/i, "Colour"], [/\bsizes?\b/i, "Size"], [/\bprices?\b/i, "Price"], [/\bcheckout\b/i, "Checkout"],
  [/\bstock\b|\bavailability\b/i, "Stock"], [/\bdelivery\b/i, "Delivery"],
];

export type NotifyLink = { title: string; path: string; sections: readonly string[] };

/**
 * The page a notification's message links to, when the benefit is about
 * sending the person to a store or product page ("Send the shopper to the
 * store"): the page and what the benefit says it holds. Null otherwise, so a
 * thank-you or a welcome keeps a plain notification.
 */
export function notifyLink(page: SeoPage, benefit: ContentBlock): NotifyLink | null {
  const text = `${benefit[0]} ${positiveBody(benefit[1])}`;
  if (!/\b(?:product page|store|checkout)\b/i.test(text)) return null;
  const title = /\bproduct page\b/i.test(text) ? "Product page" : previewDestination(page, benefit)?.title;
  if (!title) return null;
  const sections = storeWords
    .map(([pattern, label]) => ({ label, at: text.search(pattern) }))
    .filter((item) => item.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((item) => item.label);
  return { title, path: destinationPath(title), sections: sections.slice(0, 3) };
}
