import type { CSSProperties, ReactNode } from "react";
import { seoPages, type SeoPage } from "@/src/content/seo";
import { exampleContext, exampleDrawsPost, incomingFor, isStoryMention, postCaption } from "../../seo-example";
import { detailLayout, fnv1a } from "../../seo-layout";
import { destinationFor } from "../benefits/outcomes";
import styles from "./post-art.module.css";
import { brandHandle } from "./shared";

/*
 * The artwork of the post, Page post or Story the example starts from, drawn
 * the way creators and small brands post typographic graphics: a small kicker,
 * a bold short headline about what the post offers, the request word, and a
 * few flat shapes in the page's accent palette. It sizes itself to its frame
 * (container query units), so one drawing fills a 4:5 post, a 1:1 Page post, a
 * 9:16 Story and a thumbnail in a DM. Decorative: the phone carries the copy.
 *
 * Words, shapes and anything laid over the post (the comment that arrives) share
 * one grid, so shapes sit in the rows the words leave free and the comment
 * never covers the words.
 */

export type PostArtFormat = "post" | "story";

export type PostArtMotif = "burst" | "rings" | "pages" | "swatches" | "waves" | "lens" | "bubbles" | "bag" | "tee" | "book";
export type PostArtTone = "accent" | "tint" | "yellow";
/** corner: words down the left, a shape under the headline on the right. center: words centred on a badge shape. */
export type PostArtLayout = "corner" | "center";

type Theme = {
  /** `{noun}` is the destination, in lower case. */
  kicker: string;
  /** Post copy with the highlighted word in asterisks. */
  headline: string;
  motif: PostArtMotif;
};

/* What each request word's post offers. Keyed by the request word, or by the destination when nobody types one. */
const themes: Record<string, Theme> = {
  // The post names one thing: the kicker and headline both say what the comment gets.
  GUIDE: { kicker: "Free {noun}", headline: "Steal my *{noun}*", motif: "pages" },
  CHECKLIST: { kicker: "Free download", headline: "The launch *checklist*", motif: "pages" },
  FREEBIE: { kicker: "For followers", headline: "A *freebie* for you", motif: "burst" },
  TEMPLATE: { kicker: "For followers", headline: "The *template* pack", motif: "pages" },
  PRESET: { kicker: "Free preset", headline: "Get this *edit*", motif: "swatches" },
  SHOP: { kicker: "New drop", headline: "Meet the *{noun}*", motif: "swatches" },
  BAG: { kicker: "Featured", headline: "Bag of the *day*", motif: "bag" },
  LOOK: { kicker: "New in", headline: "Shop the *look*", motif: "tee" },
  DEAL: { kicker: "Story deal", headline: "A little *deal* for you", motif: "burst" },
  SHADE: { kicker: "Shade finder", headline: "Find your *shade*", motif: "swatches" },
  OFFER: { kicker: "Special offer", headline: "*Treat* yourself", motif: "burst" },
  COURSE: { kicker: "New course", headline: "Join the *course*", motif: "pages" },
  "WEEKEND COURSE": { kicker: "Weekend course", headline: "Learn on *weekends*", motif: "pages" },
  PROGRAMME: { kicker: "New programme", headline: "Train with a *plan*", motif: "rings" },
  COACHING: { kicker: "Coaching", headline: "Work *with me*", motif: "rings" },
  EPISODE: { kicker: "New episode", headline: "The full *episode*", motif: "waves" },
  NEWSLETTER: { kicker: "Newsletter", headline: "Get it in your *inbox*", motif: "pages" },
  MENU: { kicker: "Now serving", headline: "Our new *menu*", motif: "rings" },
  SHOOT: { kicker: "Now booking", headline: "Shoot *packages*", motif: "lens" },
  EVENT: { kicker: "Live event", headline: "You’re *invited*", motif: "burst" },
  LISTING: { kicker: "Just listed", headline: "Your next *home*?", motif: "rings" },
  ITINERARY: { kicker: "Plan your trip", headline: "The full *itinerary*", motif: "rings" },
  WEBINAR: { kicker: "Free webinar", headline: "Save your *seat*", motif: "waves" },
  COLLAB: { kicker: "Brand collabs", headline: "Let’s work *together*", motif: "bubbles" },
  GIVEAWAY: { kicker: "Giveaway", headline: "It’s a *giveaway*", motif: "burst" },
  ENTER: { kicker: "Giveaway", headline: "Enter to *win*", motif: "burst" },
  BOOK: { kicker: "Now booking", headline: "Book your *slot*", motif: "lens" },
  // Rings rising out of the edge, like a sunrise: something on its way.
  LAUNCH: { kicker: "Coming soon", headline: "Something *new*", motif: "rings" },
  HOURS: { kicker: "Visit us", headline: "Come say *hello*", motif: "rings" },
  PRICE: { kicker: "Just in", headline: "New *arrivals*", motif: "swatches" },
  HELP: { kicker: "Support", headline: "We’re here to *help*", motif: "bubbles" },
};

const motifs: readonly PostArtMotif[] = ["burst", "rings", "pages", "swatches", "waves", "lens", "bubbles"];
const feedTones: readonly PostArtTone[] = ["accent", "yellow", "tint"];
const layouts: readonly PostArtLayout[] = ["corner", "center"];

/** A product the post shows, drawn as itself. */
const productMotifs: Record<string, PostArtMotif> = { bag: "bag", tote: "bag", shirt: "tee", tee: "tee", "t-shirt": "tee", top: "tee", dress: "tee" };

const pageKey = (page: SeoPage) => `${page.collection}/${page.slug}`;

/** A Reel rather than a photo post: the phone marks it with a Reel badge in the top right corner. */
export function isReel(page: SeoPage): boolean {
  return /\breel\b/i.test(`${page.label} ${page.example.reply}`);
}

/**
 * The longest line of the headline set on two lines, split where the lines come
 * out most even ("Something | new" is 9). A corner post with a comment on a
 * square frame sets its headline in a narrow column beside the shape, sized so
 * these two lines fit.
 */
export function twoLineLength(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 2) return text.length;
  return Math.min(...words.slice(1).map((_, index) => Math.max(words.slice(0, index + 1).join(" ").length, words.slice(index + 1).join(" ").length)));
}

/** Orders two score lists by their first difference. */
function compareKeys(a: readonly number[], b: readonly number[]): number {
  const at = a.findIndex((value, index) => value !== b[index]);
  return at < 0 ? 0 : a[at] - b[at];
}

type FeedLook = { tone: PostArtTone; layout: PostArtLayout };
const feedLooks: readonly FeedLook[] = feedTones.flatMap((tone) => layouts.map((layout) => ({ tone, layout })));
const lookId = (look: FeedLook) => `${look.tone}/${look.layout}`;

/**
 * Tone and layout for every feed post the catalogue shows (only the phone
 * example draws it), chosen in catalogue order so pages look different across
 * the whole catalogue, not only within a topic. Each page takes, in priority:
 * a pair its topic has not used yet (pages that share an accent read as
 * different posts); a tone unlike the post before it; the tone, then the pair,
 * used least so far (no colour takes over the catalogue). A post with a comment
 * whose square frame has no room for the corner layout (a headline too long for
 * its narrow column, or a Reel, whose badge takes the top right corner) takes
 * the centre layout.
 */
const shownLooks: ReadonlyMap<string, FeedLook> = (() => {
  const chosen = new Map<string, FeedLook>();
  const topicUsed = new Map<string, Set<string>>();
  const toneCount = new Map<PostArtTone, number>();
  const pairCount = new Map<string, number>();
  let previous: FeedLook | null = null;
  const shown = seoPages.filter((page) => exampleDrawsPost(page) && exampleContext(page) !== "story" && detailLayout(page).example === "phone");
  for (const page of shown) {
    const used = topicUsed.get(page.topic) ?? new Set<string>();
    const commented = exampleContext(page) === "post" || exampleContext(page) === "page";
    const tight = commented && (twoLineLength(themeFor(page).headline.replace(/\*/g, "")) > 10 || isReel(page));
    const seed = fnv1a(`post-art:${pageKey(page)}`);
    const score = (look: FeedLook, index: number) => [
      tight && look.layout === "corner" ? 1 : 0,
      used.has(lookId(look)) ? 1 : 0,
      look.tone === previous?.tone ? 1 : 0,
      toneCount.get(look.tone) ?? 0,
      pairCount.get(lookId(look)) ?? 0,
      (index + seed) % feedLooks.length,
    ];
    const look = feedLooks
      .map((candidate, index) => ({ candidate, key: score(candidate, index) }))
      .sort((a, b) => compareKeys(a.key, b.key))[0].candidate;
    chosen.set(pageKey(page), look);
    used.add(lookId(look));
    topicUsed.set(page.topic, used);
    toneCount.set(look.tone, (toneCount.get(look.tone) ?? 0) + 1);
    pairCount.set(lookId(look), (pairCount.get(lookId(look)) ?? 0) + 1);
    previous = look;
  }
  return chosen;
})();

/** A page whose post the phone does not show gets a steady look of its own. */
function feedLook(page: SeoPage): FeedLook {
  return shownLooks.get(pageKey(page)) ?? feedLooks[fnv1a(`post-art:${pageKey(page)}`) % feedLooks.length];
}

/** "Featured bag" is a bag, "Course overview" a course. */
function nounOf(title: string): string {
  return title.replace(/^(free|featured)\s+/i, "").replace(/\s+(page|details|overview)$/i, "").toLowerCase();
}

function themeFor(page: SeoPage): Theme {
  const incoming = incomingFor(page);
  const destination = destinationFor(page);
  const noun = nounOf(destination.title);
  const seed = fnv1a(`${page.collection}/${page.slug}:post-art`);
  // Someone else's Story that mentions you: their own post, not your offer.
  if (isStoryMention(page)) {
    return { kicker: "Today", headline: /thank/i.test(page.label) ? "Look what *arrived*" : "Out and *about*", motif: "rings" };
  }
  // An agency's client post: the resource the event names ("requested the client’s launch guide").
  const resource = incoming.kind === "event" ? incoming.text.replace(/^requested\s+(?:the\s+client’s\s+|the\s+|your\s+)?/i, "") : "";
  if (resource && resource !== incoming.text) {
    const words = resource.split(/\s+/);
    return { kicker: "Launch week", headline: `The ${words.slice(0, -1).join(" ")} *${words.at(-1)}*`.replace(/\s+\*/, " *"), motif: "pages" };
  }
  const word = destination.word;
  if (word === "SHOP") {
    const motif = productMotifs[noun] ?? "swatches";
    return { kicker: isReel(page) ? "Shop the Reel" : "New drop", headline: noun === "product" ? "Want *this* one?" : `Meet the *${noun}*`, motif };
  }
  // A restaurant's MENU is its menu; a link menu answers MENU with every link.
  if (word === "MENU" && destination.title !== "Menu") return { kicker: "Link menu", headline: "All our *links*", motif: "pages" };
  if (word === "PRICE" && !/product/i.test(page.label)) return { kicker: "New in", headline: "Just *landed*", motif: "swatches" };
  const theme = themes[word];
  // A guide is drawn as a booklet, a checklist as its ticked page.
  const motif = word === "GUIDE" && noun === "guide" ? "book" : theme?.motif;
  if (theme && motif) return { kicker: theme.kicker.replace("{noun}", noun), headline: theme.headline.replace("{noun}", noun), motif };
  return { kicker: "New post", headline: `The *${noun}*`, motif: motifs[seed % motifs.length] };
}

export type HeadlinePart = { text: string; mark: boolean };

export type PostArtCopy = {
  kicker: string;
  headline: readonly HeadlinePart[];
  /**
   * The request the post asks for ("Comment GUIDE"), when it asks for a word. A Story asks with its sticker instead.
   * `quote` marks the word to send after "DM us"; `tail` ("for it") ties a request word to a post that offers something else.
   */
  cta: { verb: string; word: string; quote: boolean; tail: string | null } | null;
  /** A Story's sticker: its caption, or your handle on a Story that mentions you. */
  sticker: string | null;
  /** The sticker at thumbnail size, where a sentence cannot be read: the request ("Reply SHADE") or the mention. Null hides it there. */
  stickerShort: string | null;
  motif: PostArtMotif;
  tone: PostArtTone;
  layout: PostArtLayout;
};

/** Request words that name a thing the post could offer. */
const resourceWords = new Set(["GUIDE", "CHECKLIST", "TEMPLATE", "PRESET", "EPISODE", "ITINERARY", "COURSE", "MENU", "NEWSLETTER", "FREEBIE"]);

/** The request, in the same words as the post's caption. */
function ctaFor(page: SeoPage, theme: Theme): PostArtCopy["cta"] {
  const keyword = incomingFor(page).keyword;
  if (!keyword) return null;
  // "Comment GUIDE" under a post offering a checklist: the word is how to ask for it, so say so.
  const named = `${theme.kicker} ${theme.headline}`.toLowerCase().includes(keyword.toLowerCase());
  const tail = resourceWords.has(keyword) && !named ? "for it" : null;
  if (page.topic === "messages" || page.topic === "leads") return { verb: "DM us", word: keyword, quote: true, tail };
  return { verb: "Comment", word: keyword, quote: false, tail };
}

/** The post art's words, shapes and colours for a page. Pure, so tests can check every page. */
export function postArtCopy(page: SeoPage, format: PostArtFormat): PostArtCopy {
  const theme = themeFor(page);
  const headline = theme.headline.split("*").map((text, index) => ({ text, mark: index % 2 === 1 })).filter((part) => part.text);
  const mention = isStoryMention(page);
  const story = format === "story";
  const keyword = incomingFor(page).keyword;
  const look = story ? { tone: mention ? "tint" as const : "accent" as const, layout: "corner" as const } : feedLook(page);
  return {
    kicker: theme.kicker,
    headline,
    cta: story ? null : ctaFor(page, theme),
    sticker: story ? (mention ? `@${brandHandle}` : postCaption(page)) : null,
    stickerShort: story ? (mention ? `@${brandHandle}` : keyword ? `Reply ${keyword}` : null) : null,
    motif: theme.motif,
    ...look,
  };
}

/** The headline's plain words, for sizing and tests. */
export function headlineText(copy: Pick<PostArtCopy, "headline">): string {
  return copy.headline.map((part) => part.text).join("");
}

/* ---------- Shapes, drawn in a 100 by 100 box ---------- */

function starPoints(cx: number, cy: number, outer: number, inner: number, points: number): string {
  return Array.from({ length: points * 2 }, (_, index) => {
    const radius = index % 2 === 0 ? outer : inner;
    const angle = (Math.PI * index) / points - Math.PI / 2;
    return `${(cx + radius * Math.cos(angle)).toFixed(1)},${(cy + radius * Math.sin(angle)).toFixed(1)}`;
  }).join(" ");
}

/** A four-point sparkle centred on (x, y). */
function sparkle(x: number, y: number, size: number): string {
  return `M${x} ${y - size}Q${x} ${y} ${x + size} ${y}Q${x} ${y} ${x} ${y + size}Q${x} ${y} ${x - size} ${y}Q${x} ${y} ${x} ${y - size}Z`;
}

const burstPoints = starPoints(50, 50, 48, 37, 14);
const badgeBurst = starPoints(50, 50, 49, 42, 20);

/* The main shape beside the words. a and b are tones of the background, c the one bright pop. */
function Shapes({ motif }: { motif: PostArtMotif }) {
  switch (motif) {
    case "burst":
      return (
        <>
          <polygon points={burstPoints} className={styles.a} />
          <circle cx={50} cy={50} r={23} className={styles.b} />
          <path d={sparkle(50, 50, 9)} className={styles.c} />
        </>
      );
    case "rings":
      // Centred where the frame's right edge crosses the box, so the rings rise out of the edge.
      return (
        <>
          <circle cx={71} cy={50} r={46} className={styles.a} />
          <circle cx={71} cy={50} r={32} className={styles.b} />
          <circle cx={71} cy={50} r={18} className={styles.c} />
        </>
      );
    case "pages":
      return (
        <>
          <rect x={28} y={10} width={52} height={70} rx={6} className={styles.a} transform="rotate(10 54 45)" />
          <g transform="rotate(-6 46 56)">
            <rect x={18} y={20} width={56} height={74} rx={6} className={styles.b} />
            {[0, 1, 2].map((row) => (
              <g key={row}>
                <circle cx={30} cy={36 + row * 15} r={4.2} className={styles.c} />
                <rect x={38} y={34 + row * 15} width={row === 2 ? 18 : 28} height={4.2} rx={2.1} className={styles.a} />
              </g>
            ))}
          </g>
        </>
      );
    case "swatches":
      return (
        <>
          <circle cx={38} cy={60} r={28} className={styles.a} />
          <circle cx={68} cy={34} r={22} className={styles.b} />
          <circle cx={72} cy={74} r={14} className={styles.c} />
        </>
      );
    case "waves":
      return (
        <>
          {[24, 44, 70, 38, 58, 30, 18].map((height, index) => (
            <rect key={index} x={10 + index * 12.5} y={50 - height / 2} width={7.5} height={height} rx={3.75} className={index === 2 ? styles.c : styles.a} />
          ))}
        </>
      );
    case "lens":
      return (
        <>
          <rect x={4} y={28} width={92} height={62} rx={14} className={styles.a} />
          <rect x={16} y={18} width={26} height={14} rx={4} className={styles.a} />
          <circle cx={52} cy={59} r={22} className={styles.b} />
          <circle cx={52} cy={59} r={10} className={styles.c} />
        </>
      );
    case "bubbles":
      return (
        <>
          <path d="M30 26h52a16 16 0 0 1 16 16v8a16 16 0 0 1-16 16H58l-12 11V66H30a16 16 0 0 1-16-16v-8a16 16 0 0 1 16-16Z" className={styles.a} />
          <path d="M44 78h34a11 11 0 0 1 11 11v1a11 11 0 0 1-11 11H44a11 11 0 0 1-11-11v-1a11 11 0 0 1 11-11Z" className={styles.b} />
          {[42, 56, 70].map((x) => <circle key={x} cx={x} cy={46} r={4.6} className={styles.c} />)}
        </>
      );
    case "bag":
      // A tote: body, handle, and a round label.
      return (
        <>
          <path d="M32 36V28a18 18 0 0 1 36 0v8" className={styles.handle} />
          <path d="M16 36h68l-6 56a6 6 0 0 1-6 5H28a6 6 0 0 1-6-5Z" className={styles.a} />
          <path d="M16 36h68l-1.4 13H17.4Z" className={styles.b} />
          <circle cx={50} cy={70} r={12} className={styles.c} />
        </>
      );
    case "book":
      // An open booklet with a ribbon, drawn in the box's left three quarters so the frame's edge never cuts a page.
      return (
        <>
          <path d="M38 26C29 19 17 17 2 20v58c15-3 27-1 36 6Z" className={styles.a} />
          <path d="M38 26c9-7 21-9 36-6v58c-15-3-27-1-36 6Z" className={styles.b} />
          {[38, 49, 60].map((y, index) => <rect key={y} x={44} y={y} width={index === 2 ? 14 : 22} height={4.2} rx={2.1} className={styles.a} />)}
          <path d="M62 21.5h6V38l-3-3-3 3Z" className={styles.c} />
        </>
      );
    case "tee":
      return (
        <>
          <path d="M34 12 18 20 4 42l16 9 6-10v54h48V41l6 10 16-9-14-22-16-8a16 16 0 0 1-32 0Z" className={styles.a} />
          <path d="M26 58h48v12H26Z" className={styles.b} />
          <path d={sparkle(62, 36, 9)} className={styles.c} />
        </>
      );
  }
}

/* The badge the centred words sit on: one big tone-on-tone shape, so the overlap is the point. */
function Badge({ motif }: { motif: PostArtMotif }) {
  switch (motif) {
    case "burst":
      return <polygon points={badgeBurst} className={styles.a} />;
    case "pages":
      return (
        <>
          <rect x={6} y={6} width={88} height={88} rx={5} className={styles.a} transform="rotate(-4 50 50)" />
          {/* Tape on the top-right corner, clear of the centred kicker. */}
          <rect x={76} y={1} width={24} height={9} rx={2} className={styles.c} transform="rotate(38 88 5.5)" />
        </>
      );
    case "bubbles":
      return <path d="M24 8h52a20 20 0 0 1 20 20v34a20 20 0 0 1-20 20H48L30 97V82h-6A20 20 0 0 1 4 62V28A20 20 0 0 1 24 8Z" className={styles.a} />;
    case "waves":
      return <rect x={4} y={4} width={92} height={92} rx={26} className={styles.a} />;
    case "lens":
      // A camera lens seen face on: the barrel and its two focus rings, with the words on the glass.
      return (
        <>
          <circle cx={50} cy={50} r={48} className={styles.a} />
          <circle cx={50} cy={50} r={44.5} className={styles.ring} />
          <circle cx={50} cy={50} r={41.5} className={styles.ringThin} />
        </>
      );
    default:
      return <circle cx={50} cy={50} r={48} className={styles.a} />;
  }
}

/* The small pop in a lower corner of a feed post, in a 24 by 24 box. */
function Corner({ motif }: { motif: PostArtMotif }) {
  if (motif === "rings") return <circle cx={12} cy={12} r={8} className={styles.c} />;
  if (motif === "waves") return <><circle cx={12} cy={12} r={10} className={styles.c} /><path d="M9.5 7.5v9l7-4.5Z" className={styles.cInk} /></>;
  return <path d={sparkle(12, 12, 11)} className={styles.c} />;
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * The post's artwork, filling its frame. `children` is laid over the post's foot
 * (the comment that arrives), in the same grid as the words, so it never covers them.
 */
export function PostArt({ page, format, className, children }: { page: SeoPage; format: PostArtFormat; className?: string; children?: ReactNode }) {
  const copy = postArtCopy(page, format);
  const text = headlineText(copy);
  const post = format === "post";
  const center = post && copy.layout === "center";
  // Sized so the longest word fits the frame's width (never cut, never broken mid-word), or in a narrow column, two even lines.
  const longest = Math.max(...text.split(/\s+/).map((word) => word.length));
  const style = { "--art-word": longest, "--art-pair": twoLineLength(text) } as CSSProperties;
  const short = copy.stickerShort && copy.stickerShort !== copy.sticker ? copy.stickerShort : null;
  return (
    <div
      className={cx(styles.art, className)}
      data-post-art={`${page.collection}/${page.slug}`}
      data-format={format}
      data-layout={post ? copy.layout : undefined}
      data-tone={copy.tone}
      data-motif={copy.motif}
      data-overlay={children ? "true" : undefined}
      style={style}
      aria-hidden="true"
    >
      <div className={styles.frame}>
        <div className={styles.canvas}>
          <svg className={styles.shapes} viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            {center ? <Badge motif={copy.motif} /> : <Shapes motif={copy.motif} />}
          </svg>
          {post ? <svg className={styles.corner} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><Corner motif={copy.motif} /></svg> : null}
          {center ? <svg className={styles.spark} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={sparkle(12, 12, 11)} className={styles.c} /></svg> : null}
        </div>
        <div className={styles.copy}>
          <span className={styles.kicker}>{copy.kicker}</span>
          <span className={styles.headline}>
            {copy.headline.map((part, index) => (part.mark ? <em key={index}>{part.text}</em> : part.text))}
          </span>
          {copy.cta ? (
            <span className={styles.cta}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20.5 11.6c0 4.2-3.8 7.6-8.5 7.6a9.6 9.6 0 0 1-2.6-.35L4.8 20.5l1.2-3.4a7.2 7.2 0 0 1-2.5-5.5C3.5 7.4 7.3 4 12 4s8.5 3.4 8.5 7.6Z" /></svg>
              {copy.cta.verb} <strong>{copy.cta.quote ? `“${copy.cta.word}”` : copy.cta.word}</strong>{copy.cta.tail ? ` ${copy.cta.tail}` : null}
            </span>
          ) : null}
          {copy.sticker ? (
            <span
              className={styles.sticker}
              data-mention={copy.sticker.startsWith("@") ? "true" : undefined}
              data-short={short ? "true" : undefined}
              data-thumb={copy.stickerShort ? undefined : "hide"}
            >
              <span className={styles.stickerLong}>{copy.sticker}</span>
              {short ? <span className={styles.stickerShort}>{short}</span> : null}
            </span>
          ) : null}
          {children ? <div className={styles.overlay}>{children}</div> : null}
        </div>
      </div>
    </div>
  );
}
