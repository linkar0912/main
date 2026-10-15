import type { ReactNode } from "react";
import { seoPages, type SeoPage, type SeoTopic } from "@/src/content/seo";
import { Icon, MockAvatar, MockPageAvatar } from "../../mock-ui";
import { exampleContext, exampleDrawsPost, exampleHandle, incomingFor, isStoryMention, postCaption, triggerLabel } from "../../seo-example";
import { detailLayout, fnv1a, mulberry32, pageCoin } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import { topicVisuals } from "../../seo-theme";
import { destinationFor, destinationPath } from "../benefits/outcomes";
import styles from "./zigzag-visual.module.css";

/*
 * The overview zigzag's square: the place where the page's request arrives,
 * drawn as the app shows it on a light colour panel. A post or Page post with
 * its comments, a Story with its reply bar, or the inbox with a new
 * conversation at the top (under the post that asked for it, when the person
 * sends a word from a post). The request itself floats over the square's bottom
 * corner (the zigzag draws it), so every screen keeps its bottom as plain white
 * where the request lands: lists show only the whole rows that end above it.
 * Any post artwork is type on colour, never a photo. Decorative: hidden from
 * assistive tech, and the section's copy carries the meaning.
 */

const brand = "yourbrand";
const pageName = "Your Page";

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export type PanelTone = "yellow" | "lilac" | "pink" | "mint" | "sky";
export type ArtTone = "accent" | "ink" | "yellow";
export type ArtShape = "circle" | "sparkle";
/** A loose app card, or the same screen inside a phone. */
export type SceneFrame = "card" | "phone";
export type ZigzagLook = { panel: PanelTone; art: ArtTone; shape: ArtShape; frame: SceneFrame };

const panelTones: readonly PanelTone[] = ["yellow", "lilac", "pink", "mint", "sky"];
const artTones: readonly ArtTone[] = ["accent", "ink", "yellow"];

type PageRef = Pick<SeoPage, "collection" | "slug">;
const pageKey = (page: PageRef) => `${page.collection}/${page.slug}`;
const seeded = (page: PageRef, purpose: string) => mulberry32(fnv1a(`${pageKey(page)}:${purpose}`));

/** Whether the square draws an app screen that can sit loose or inside a phone (Stories and the post-and-inbox pair cannot). */
function usesFrame(page: SeoPage): boolean {
  const context = exampleContext(page);
  return context !== "story" && !(context === "inbox" && exampleDrawsPost(page));
}

let dealt: ReadonlyMap<string, Pick<ZigzagLook, "panel" | "frame">> | null = null;

/**
 * Panels and frames for the pages that draw this square, dealt rather than
 * rolled: in topic order the panels go round the five tones, so they come out
 * even overall and pages on one topic get different panels. Within a topic,
 * pages that draw the same scene on the same side come together, so they
 * never share a panel even when a topic has more pages than tones; and the
 * screens alternate between loose and in a phone.
 */
function zigzagDeal(): ReadonlyMap<string, Pick<ZigzagLook, "panel" | "frame">> {
  if (dealt) return dealt;
  const sortKey = (page: SeoPage) => [
    page.topic,
    usesFrame(page) ? "a" : "b",
    pageCoin(page, "overview") ? "a" : "b",
    String(fnv1a(`${pageKey(page)}:overview-deal`)).padStart(10, "0"),
  ].join("/");
  const pages = seoPages
    .filter((page) => detailLayout(page).overview === "zigzag")
    .map((page) => ({ page, key: sortKey(page) }))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(({ page }) => page);
  const framed = new Map<SeoTopic, number>();
  dealt = new Map(pages.map((page, index) => {
    const nth = usesFrame(page) ? framed.get(page.topic) ?? fnv1a(page.topic) % 2 : 0;
    if (usesFrame(page)) framed.set(page.topic, nth + 1);
    return [pageKey(page), { panel: panelTones[index % panelTones.length], frame: nth % 2 === 0 ? "card" : "phone" }];
  }));
  return dealt;
}

/* Instagram topics whose mock handles can fill out an inbox (Facebook mocks use full names). */
const inboxTopics: readonly SeoTopic[] = ["comments", "messages", "stories", "leads", "followers", "team", "insights"];
const inboxPool: readonly string[] = inboxTopics.flatMap((topic) => topicVisuals[topic].handles);

let senders: ReadonlyMap<string, string> | null = null;

/**
 * Who sends each zigzag page's request, dealt so no two pages share a sender:
 * each page takes one of its topic's own three handles while they last (from
 * the second, the one the rest of the page uses), and the pages left over take
 * the Instagram handles nobody has yet.
 */
function zigzagSenders(): ReadonlyMap<string, string> {
  if (senders) return senders;
  const pages = seoPages
    .filter((page) => page.topic !== "facebook" && detailLayout(page).overview === "zigzag")
    .sort((a, b) => fnv1a(`${pageKey(a)}:overview-sender`) - fnv1a(`${pageKey(b)}:overview-sender`));
  const dealtTo = new Map<string, string>();
  const used = new Set<string>();
  const waiting: SeoPage[] = [];
  for (const page of pages) {
    const [first, second, third] = topicVisuals[page.topic].handles;
    const own = [second, third, first].find((handle) => !used.has(handle));
    if (own) {
      used.add(own);
      dealtTo.set(pageKey(page), own);
    } else waiting.push(page);
  }
  const spare = inboxPool.filter((handle) => !used.has(handle));
  waiting.forEach((page, index) => dealtTo.set(pageKey(page), spare[index % spare.length] ?? exampleHandle(page, 1)));
  senders = dealtTo;
  return senders;
}

/** The person whose request floats over this page's square (and whose new conversation tops its inbox). */
export function zigzagSender(page: SeoPage): string {
  return zigzagSenders().get(pageKey(page)) ?? exampleHandle(page, 1);
}

/** The panel, artwork colour, artwork shape and frame for a page: fixed per page, so a page always looks the same. */
export function zigzagLook(page: SeoPage): ZigzagLook {
  const next = seeded(page, "overview-visual");
  const rolled = panelTones[Math.floor(next() * panelTones.length)];
  const drawn = artTones[Math.floor(next() * artTones.length)];
  const shape = next() < .5 ? "circle" : "sparkle";
  const { panel, frame } = zigzagDeal().get(pageKey(page)) ?? { panel: rolled, frame: next() < .5 ? "card" : "phone" };
  // Yellow artwork on a yellow panel would vanish into it.
  const art = panel === "yellow" && drawn === "yellow" ? "accent" : drawn;
  return { panel, art, shape, frame };
}

/** A Reel when the page or its reply says so ("the preset from this Reel"). */
function isReel(page: SeoPage): boolean {
  return /\breel\b/i.test(`${page.label} ${page.example.reply}`);
}

/* What the business's post says, by the word people send for it. Short, like type on a post. */
const artworkLines: Record<string, string> = {
  BAG: "The featured bag",
  BOOK: "Book a session",
  CHECKLIST: "The launch checklist",
  COACHING: "Coaching calls",
  COLLAB: "Let’s collaborate",
  COURSE: "Inside the course",
  DEAL: "Today’s deal",
  ENTER: "Giveaway time",
  EPISODE: "New episode",
  EVENT: "Save the date",
  FREEBIE: "The freebie",
  GIVEAWAY: "Giveaway time",
  GUIDE: "The guide",
  HELP: "Here to help",
  HOURS: "Opening hours",
  INSTALL: "Installation",
  ITINERARY: "The full itinerary",
  LAUNCH: "Launch day",
  LISTING: "New listing",
  LOOK: "Shop the look",
  MENU: "Our menu",
  NEWSLETTER: "The newsletter",
  OFFER: "This week’s offer",
  PRESET: "The preset",
  PRICE: "Our prices",
  PROGRAMME: "The programme",
  SHADE: "Find your shade",
  SHIPPING: "Shipping",
  SHOOT: "Shoot packages",
  SIZE: "Size guide",
  START: "Start here",
  TEMPLATE: "Template pack",
  WEBINAR: "The webinar",
  "WEEKEND COURSE": "The weekend course",
};

/** The headline on the business's post or Story, from the page's offer. */
export function artworkHeadline(page: SeoPage): string {
  const { title, word } = destinationFor(page);
  if (word === "SHOP") return isReel(page) ? "Shop this Reel" : "Now in the shop";
  return artworkLines[word] ?? (/\b(resource|page)\b/i.test(title) ? "New post" : title);
}

/* Glyphs the mock kit does not draw. */
const glyphPaths = {
  bookmark: "M6.5 4.5h11v15.5L12 15.6l-5.5 4.4V4.5Z",
  camera: "M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8ZM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  compose: "M11 4.5H6.5a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V13M17.6 3.9a1.9 1.9 0 0 1 2.7 2.7l-7.8 7.8-3.5.8.8-3.5 7.8-7.8Z",
  globe: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM3.5 12h17M12 3.5c2.2 2.3 3.3 5.1 3.3 8.5s-1.1 6.2-3.3 8.5c-2.2-2.3-3.3-5.1-3.3-8.5S9.8 5.8 12 3.5Z",
  music: "M9 18V6l10-2v12M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Zm10-2a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0Z",
  search: "M11 17.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM16 16l4.5 4.5",
  thumb: "M7.5 10.5v9h-3v-9h3Zm0 0 3.6-6.2a1.6 1.6 0 0 1 3 .9l-.6 3.8h4.8a1.8 1.8 0 0 1 1.8 2.1l-1.1 6.6a1.8 1.8 0 0 1-1.8 1.5H7.5",
} as const;

function Glyph({ name, size = 20, className }: { name: keyof typeof glyphPaths; size?: number; className?: string }) {
  return (
    <svg className={cx(styles.glyph, className)} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={glyphPaths[name]} />
    </svg>
  );
}

function PlayGlyph() {
  return (
    <svg className={styles.glyph} width={12} height={12} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M7 4.5v15l12.5-7.5L7 4.5Z" />
    </svg>
  );
}

function Dots() {
  return <span className={styles.dots}><i /><i /><i /></span>;
}

/** Your own avatar with Instagram's Story ring. */
function BrandAvatar({ size = 32 }: { size?: number }) {
  return <span className={styles.ring}><MockAvatar name={brand} tone="yellow" size={size} /></span>;
}

/** The headline with its last word in the artwork's highlight colour. */
function Headline({ text, className }: { text: string; className: string }) {
  const at = text.lastIndexOf(" ");
  return (
    <strong className={className}>
      {at > 0 ? <>{text.slice(0, at)} </> : null}
      <span className={styles.hi}>{at > 0 ? text.slice(at + 1) : text}</span>
    </strong>
  );
}

/** The caption with the request word marked, the way the person will type it. */
function CaptionText({ page }: { page: SeoPage }) {
  const caption = postCaption(page);
  const keyword = incomingFor(page).keyword;
  if (!keyword || !caption.includes(keyword)) return <>{caption}</>;
  const [before, ...after] = caption.split(keyword);
  return <>{before}<b className={styles.word}>{keyword}</b>{after.join(keyword)}</>;
}

/** The business's post graphic: type on colour, with a shape for life. A post that asks for a DM says so on the graphic. */
function Artwork({ page, look, reel = false, ask }: { page: SeoPage; look: ZigzagLook; reel?: boolean; ask?: string }) {
  return (
    <div className={styles.art} data-shape={look.shape}>
      <span className={styles.artShape} />
      {look.shape === "sparkle" ? <span className={styles.artSparkle}><Icon name="sparkle" size={40} /></span> : null}
      {reel ? <span className={styles.reel}><PlayGlyph />Reel</span> : null}
      <Headline className={styles.artHeadline} text={artworkHeadline(page)} />
      {ask ? <span className={styles.ask}>DM us <b>{ask}</b></span> : null}
    </div>
  );
}

type SceneProps = { page: SeoPage; look: ZigzagLook };

function StatusBar() {
  return <p className={styles.statusBar}><span>9:41</span><span className={styles.island} /><span className={styles.signal}><i /><i /><i /><i /></span></p>;
}

/** A white app screen: loose on the panel, or inside a phone with its status bar. Both run off the panel's bottom. */
function Screen({ kind, look, children }: { kind: "post" | "page" | "inbox"; look: ZigzagLook; children: ReactNode }) {
  return (
    <div className={styles.card} data-kind={kind} data-frame={look.frame}>
      {look.frame === "phone" ? <StatusBar /> : null}
      {children}
    </div>
  );
}

/** The end of a screen: only the lines that fit above the landing request show, never part of one. */
function Tail({ children }: { children: ReactNode }) {
  return <div className={styles.tail}>{children}</div>;
}

function PostActions({ size = 22 }: { size?: number }) {
  return (
    <div className={styles.actions}>
      <Icon name="heart" size={size} /><Icon name="comment" size={size} /><Icon name="send" size={size} />
      <Glyph name="bookmark" size={size} className={styles.end} />
    </div>
  );
}

/* An Instagram post or Reel in the feed, ending on its caption and the comment field: the comment lands there. */
function PostScene({ page, look }: SceneProps) {
  const reel = isReel(page);
  return (
    <Screen kind="post" look={look}>
      <div className={styles.head}>
        <BrandAvatar />
        <p><strong>{brand}</strong>{reel ? <span><Glyph name="music" size={12} />Original audio</span> : null}</p>
        <Dots />
      </div>
      <Artwork page={page} look={look} reel={reel} />
      <PostActions />
      <Tail>
        <p className={styles.caption}><strong>{brand}</strong> <CaptionText page={page} /></p>
        <p className={styles.composer}><MockAvatar name={brand} tone="yellow" size={24} /><span>Add a comment…</span></p>
        <p className={styles.when}>2 hours ago</p>
      </Tail>
    </Screen>
  );
}

/* A Facebook Page post, ending where its comments start: the public comment lands below. */
function PageScene({ page, look }: SceneProps) {
  return (
    <Screen kind="page" look={look}>
      <div className={styles.head}>
        <MockPageAvatar size={34} />
        <p><strong>{pageName}</strong><span>Just now ·<Glyph name="globe" size={12} /></span></p>
        <Dots />
      </div>
      <p className={styles.fbText}><CaptionText page={page} /></p>
      <Artwork page={page} look={look} />
      <div className={styles.fbActions}>
        <span><Glyph name="thumb" size={17} />Like</span>
        <span><Icon name="comment" size={17} />Comment</span>
        <span><Icon name="send" size={17} />Share</span>
      </div>
      <Tail><p className={styles.sort}>Most relevant<Icon name="chevron" size={14} /></p></Tail>
    </Screen>
  );
}

/* Your Story, asking for the reply: the reply comes out of its reply bar. */
function StoryScene({ page, look }: SceneProps) {
  return (
    <div className={styles.story} data-shape={look.shape}>
      <span className={styles.artShape} />
      {look.shape === "sparkle" ? <span className={styles.artSparkle}><Icon name="sparkle" size={40} /></span> : null}
      <span className={styles.bars}><i /><i /><i /></span>
      <p className={styles.storyHead}><BrandAvatar size={24} /><strong>{brand}</strong><span>2h</span></p>
      <Headline className={styles.storyHeadline} text={artworkHeadline(page)} />
      <span className={styles.sticker}><CaptionText page={page} /></span>
      <ReplyBar />
    </div>
  );
}

/* Their Story, with your account tagged in it: no words of theirs, only the mention. */
function MentionScene({ page }: SceneProps) {
  const owner = zigzagSender(page);
  return (
    <div className={cx(styles.story, styles.theirs)}>
      <span className={styles.sun} />
      <span className={styles.hill} />
      <span className={cx(styles.hill, styles.hillBack)} />
      <span className={styles.bars}><i /><i /><i /></span>
      <p className={styles.storyHead}><MockAvatar name={owner} size={24} /><strong>{owner}</strong><span>1h</span></p>
      <span className={styles.mention}>@{brand}</span>
      <ReplyBar />
    </div>
  );
}

function ReplyBar() {
  return (
    <span className={styles.replyBar}>
      <span className={styles.replyField}>Send message</span>
      <Icon name="heart" size={22} />
      <Icon name="send" size={22} />
    </span>
  );
}

/* ---------- The inbox ---------- */

const inboxStatuses = ["Seen 1h ago", "Active 2h ago", "Seen 3h ago", "Sent yesterday", "Active 4h ago", "Seen yesterday"] as const;
const replyTimes = ["12m", "1h", "2h", "3h"] as const;

type InboxRow = { handle: string; text: string; time?: string };
type InboxCast = { rows: readonly InboxRow[]; notes: readonly string[] };

function shuffled<T>(items: readonly T[], next: () => number): T[] {
  const out = [...items];
  for (let index = out.length - 1; index > 0; index -= 1) {
    const pick = Math.floor(next() * (index + 1));
    [out[index], out[pick]] = [out[pick], out[index]];
  }
  return out;
}

/**
 * Who is already in this page's inbox, seeded per page: four earlier
 * conversations and three people with Notes, never the person whose message
 * is arriving. The first `sent` earlier conversations end on your reply with
 * the page's own link, because the same request has come in before; they sit
 * right under the new one, so they show whatever the room.
 */
function inboxCast(page: SeoPage, sent = 1): InboxCast {
  const next = seeded(page, "inbox");
  const sender = zigzagSender(page);
  const people = shuffled(inboxPool.filter((handle) => handle !== sender), next);
  const statuses = shuffled(inboxStatuses, next);
  const link = destinationPath(destinationFor(page).title.replace(/\s+page$/i, ""));
  const first = Math.floor(next() * (replyTimes.length - sent + 1));
  const rows = people.slice(0, 4).map((handle, index): InboxRow => (
    index < sent ? { handle, text: `You: ${link}`, time: replyTimes[first + index] } : { handle, text: statuses[index] }
  ));
  return { rows, notes: people.slice(4, 7) };
}

/**
 * What sits above the conversations, by topic, so inboxes on different topics
 * read differently: Notes over a DM-heavy inbox, a plain search over leads,
 * and for insights no search but the earlier replies that went out with the link.
 */
function inboxFurniture(page: SeoPage, look: ZigzagLook): { search: boolean; notes: boolean; sent: number } {
  if (page.topic === "insights") return { search: false, notes: false, sent: 2 };
  return { search: true, notes: page.topic === "messages" && look.frame === "card", sent: 1 };
}

/** Instagram Notes over the inbox: yours, not yet written, then three people you talk to. */
function Notes({ people }: { people: readonly string[] }) {
  return (
    <div className={styles.notes}>
      <span>
        <span className={styles.note}>Note…</span>
        <BrandAvatar size={46} />
        <small>Your note</small>
      </span>
      {people.map((name) => <span key={name}><MockAvatar name={name} size={50} /><small>{name.split(/[.\s]/)[0]}</small></span>)}
    </div>
  );
}

/**
 * The tabs, then the new conversation on top (its message floats below the
 * square), then earlier ones: as many whole rows as fit above the request.
 */
function InboxList({ page, cast, tabs = true }: { page: SeoPage; cast: InboxCast; tabs?: boolean }) {
  const handle = zigzagSender(page);
  return (
    <>
      {tabs ? <p className={styles.tabs}><span data-active="true">Primary</span><span>General</span><span>Requests</span></p> : null}
      <ul className={styles.rows}>
        <li data-new="true">
          <MockAvatar name={handle} size={44} />
          <p><strong>{handle}</strong><span className={styles.line}><span className={styles.preview}>New message</span><span>· now</span></span></p>
          <i className={styles.unread} />
        </li>
        {cast.rows.map((row) => (
          <li key={row.handle} data-sent={row.time ? "true" : undefined}>
            <MockAvatar name={row.handle} size={44} />
            <p>
              <strong>{row.handle}</strong>
              <span className={styles.line}><span className={styles.preview}>{row.text}</span>{row.time ? <span>· {row.time}</span> : null}</span>
            </p>
            <Glyph name="camera" size={20} className={styles.rowIcon} />
          </li>
        ))}
      </ul>
    </>
  );
}

function InboxTop() {
  return (
    <div className={styles.inboxTop}>
      <strong>{brand}<Icon name="chevron" size={16} /></strong>
      <Glyph name="compose" size={22} />
    </div>
  );
}

/*
 * The inbox with the new conversation on top; the message itself floats below.
 * Someone writing for the first time lands in your message requests, so that
 * page opens the Requests list instead of the main inbox.
 */
function InboxScene({ page, look }: SceneProps) {
  if (/first-message/.test(page.slug)) {
    // Nobody in your requests has had a reply yet.
    const cast = inboxCast(page, 0);
    return (
      <Screen kind="inbox" look={look}>
        <div className={cx(styles.inboxTop, styles.requestsTop)}>
          <Icon name="chevron" size={18} />
          <strong>Message requests</strong>
        </div>
        <p className={styles.requestsNote}>Messages from people you don’t follow yet.</p>
        <InboxList page={page} cast={cast} tabs={false} />
      </Screen>
    );
  }
  const { search, notes, sent } = inboxFurniture(page, look);
  const cast = inboxCast(page, sent);
  return (
    <Screen kind="inbox" look={look}>
      <InboxTop />
      {search ? <p className={styles.search}><Glyph name="search" size={16} />Search</p> : null}
      {notes ? <Notes people={cast.notes} /> : null}
      <InboxList page={page} cast={cast} />
    </Screen>
  );
}

/*
 * A word sent from a post: your post asking for it ("DM us MENU") up on the
 * outer side, and below it, toward the copy, the inbox it arrives in. The two
 * stack in a column, so the inbox starts wherever the post ends.
 */
function AskScene({ page, look }: SceneProps) {
  const cast = inboxCast(page);
  return (
    <div className={styles.askStack}>
      <div className={styles.askPost}>
        <div className={styles.head}>
          <BrandAvatar size={28} />
          <p><strong>{brand}</strong></p>
          <Dots />
        </div>
        <Artwork page={page} look={look} ask={incomingFor(page).keyword ?? undefined} />
        <PostActions size={19} />
      </div>
      <div className={styles.card} data-kind="inbox" data-frame="card" data-scene="ask">
        <InboxTop />
        <InboxList page={page} cast={cast} />
      </div>
    </div>
  );
}

const scenes = { post: PostScene, page: PageScene, story: StoryScene, inbox: InboxScene } as const;

/** Their Story for a mention, the post and inbox for a word sent from a post, else the page's context. */
function Scene({ page, look }: SceneProps) {
  if (isStoryMention(page)) return <MentionScene page={page} look={look} />;
  const context = exampleContext(page);
  if (context === "inbox" && exampleDrawsPost(page)) return <AskScene page={page} look={look} />;
  const Drawn = scenes[context];
  return <Drawn page={page} look={look} />;
}

/** What Linkar listens for here, as a chip reaching toward the copy. */
function TriggerChip({ children }: { children: ReactNode }) {
  return <span className={styles.chip}><span className={styles.chipIcon}><Icon name="bolt" size={14} /></span><span className={styles.chipText}>{children}</span></span>;
}

/**
 * The square for the overview zigzag. `flip` mirrors it with the section, so
 * the app card keeps to the outer side and the chip and the floating request
 * keep to the side nearest the copy.
 */
export function ZigzagVisual({ page, flip = false, className }: { page: SeoPage; flip?: boolean; className?: string }) {
  const look = zigzagLook(page);
  return (
    <div
      className={cx(styles.scene, className)}
      data-context={exampleContext(page)}
      data-flip={flip ? "true" : undefined}
      data-art={look.art}
      aria-hidden="true"
    >
      <div className={cx(styles.panel, shell[look.panel], shell.grid)}>
        <Scene page={page} look={look} />
      </div>
      <TriggerChip>{triggerLabel(page)}</TriggerChip>
    </div>
  );
}
