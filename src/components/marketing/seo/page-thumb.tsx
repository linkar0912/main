import type { CSSProperties, ReactNode } from "react";
import { getSeoPages, type SeoCollection, type SeoPage, type SeoTopic } from "@/src/content/seo";
import { LinkarMark } from "../../linkar-mark";
import {
  Icon,
  MockActionNote,
  MockAvatar,
  MockBubble,
  MockCard,
  MockComment,
  MockKeyword,
  MockLinkButton,
  MockNextNote,
  MockPageAvatar,
  MockPublicComment,
  MockStatus,
  MockSystemLine,
  MockToggleRow,
  type IconName,
} from "./mock-ui";
import {
  eventLine,
  exampleContext,
  incomingFor,
  isStoryMention,
  nextFor,
  replyFor,
  replyLabel,
  sentLabel,
  triggerLabel,
  type ExampleContext,
  type IncomingView,
  type NextView,
  type ReplyView,
} from "./seo-example";
import { topicVisuals, type SeoTone } from "./seo-theme";
import { collectsEmail, destinationFor } from "./sections/benefits/outcomes";
import styles from "./page-thumb.module.css";

/*
 * A guide's card picture: a miniature of the page's own automation, drawn as
 * product UI on a pale tint of its topic colour. Every size renders the forms
 * it can fall back to, and container queries on the visible box pick the one
 * that fits:
 * - full: the trigger chip, the comment, message, Story reply or Page comment
 *   that starts it, and the reply, as a conversation or as Linkar's builder;
 * - row: the incoming message and the start of the reply;
 * - compact: the topic icon and the word people send (or the page the reply
 *   opens), sized so the whole word always reads.
 * Decorative: the guide's label and description sit beside it as real copy.
 */

export type PageThumbSize =
  /** The hub and related cards: the full snapshot, falling back to the row and compact forms in small prints. */
  | "card"
  /** Related rows (144px and smaller): the incoming message and the reply, or the compact form. */
  | "row"
  /** The hub hero's fanned cards (64 to 84px): the topic icon and the request word. */
  | "mini";

/** The trigger icon of each topic, as the hub's topic headers show it. */
const topicIcons: Record<SeoTopic, IconName> = {
  comments: "comment",
  messages: "send",
  stories: "heart",
  leads: "user",
  followers: "user",
  team: "user",
  insights: "bolt",
  facebook: "comment",
};

/*
 * Pale tints of each topic accent, hand-picked so none comes out grey (navy,
 * teal and green mixed with white do). They are paler than the card panel
 * tones, so a print still reads as a print on any panel.
 */
const topicTints: Record<SeoTopic, string> = {
  comments: "#efe9ff",
  messages: "#fde8fc",
  stories: "#ffe8ef",
  leads: "#e1f6ea",
  followers: "#ffece0",
  team: "#e5ecff",
  insights: "#dff2f6",
  facebook: "#e4edff",
};

/** Card panel tones too close to a topic's tint: a card skips them so its print never melts into the panel. */
export const pageThumbClashes: Record<SeoTopic, readonly SeoTone[]> = {
  comments: ["lilac"],
  messages: ["pinkTint"],
  stories: ["pinkTint"],
  leads: ["mint"],
  followers: [],
  team: ["sky"],
  insights: ["mint", "sky"],
  facebook: ["sky"],
};

/* ---------- Who writes in ---------- */

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Every Instagram handle the topics use for mock UI. */
const instagramHandles: readonly string[] = (Object.keys(topicVisuals) as SeoTopic[])
  .filter((topic) => topic !== "facebook")
  .flatMap((topic) => topicVisuals[topic].handles);

/** Facebook shows names: the Facebook topic's own, then the Instagram handles as names ("kiran.learns" as "Kiran L."). */
const facebookNames: readonly string[] = [
  ...topicVisuals.facebook.handles,
  ...instagramHandles.map((handle) => {
    const [first, last = ""] = handle.split(".");
    return `${capitalise(first)} ${last.charAt(0).toUpperCase()}.`;
  }),
];

const dealtHandles = new Map<SeoCollection, ReadonlyMap<string, string>>();

/**
 * One person per guide in a collection, so no two cards on a hub show the same
 * one: each guide takes its topic's first unused handle, then any unused one.
 */
function handleFor(page: SeoPage): string {
  let dealt = dealtHandles.get(page.collection);
  if (!dealt) {
    const used = new Set<string>();
    const next = new Map<string, string>();
    for (const candidate of getSeoPages(page.collection)) {
      const pool = candidate.topic === "facebook" ? facebookNames : [...topicVisuals[candidate.topic].handles, ...instagramHandles];
      const handle = pool.find((name) => !used.has(name)) ?? pool[0];
      used.add(handle);
      next.set(candidate.slug, handle);
    }
    dealtHandles.set(page.collection, next);
    dealt = next;
  }
  return dealt.get(page.slug) ?? topicVisuals[page.topic].handles[0];
}

/**
 * The page's place among its collection's guides on the same topic. Hub groups
 * list a topic's guides in this order, so alternating the layout by it means
 * neighbouring cards in a group never draw the same picture.
 */
function topicPosition(page: SeoPage): number {
  return Math.max(0, getSeoPages(page.collection).filter((candidate) => candidate.topic === page.topic).findIndex((candidate) => candidate.slug === page.slug));
}

/* ---------- The compact form's word ---------- */

/** What the compact form says beside the topic icon. */
type CompactTag = {
  /** keyword: the word people send. mention: the Story sticker. link: the page the reply opens. team and saved: what Linkar does. */
  kind: "keyword" | "mention" | "link" | "team" | "saved";
  /** One or two lines: a two-word request ("WEEKEND COURSE") stacks rather than shrinking. */
  lines: readonly string[];
  /** The chip's width in ems (text, padding and icon), so CSS can size the text to fit the box. */
  em: number;
};

/* Advance widths in ems, measured from Bricolage Grotesque and Manrope at weight 800. */
const displayWidths: Record<string, number> = { I: .3, J: .38, L: .51, T: .58, Z: .58, F: .6, E: .63, P: .65, S: .66, Y: .66, N: .79, M: .96, W: 1, " ": .22 };
const sansWidths: Record<string, number> = { i: .3, l: .3, j: .3, I: .3, f: .39, r: .41, t: .44, " ": .2, m: .92, w: .81, M: .86, W: .99, "@": .92 };

function textEm(text: string, display: boolean): number {
  let sum = 0;
  for (const char of text) sum += display ? displayWidths[char] ?? .72 : sansWidths[char] ?? (/[A-Z]/.test(char) ? .72 : .61);
  return sum;
}

/* Words a destination's short name drops: what kind of page it is, then how it is described. */
const pageWords = /^(page|overview|details|policy)$/i;
const describingWords = /^(launch|free|opening|starting|official|service|help|and)$/i;

/** "Course overview" as "Course", "Opening hours" as "Hours", "Help and support" as "Support"; short names stay whole. */
function shortDestination(title: string): string {
  let words = title.split(/\s+/);
  if (words.length > 1) words = words.filter((word, index) => index === 0 || !pageWords.test(word));
  if (words.join(" ").length > 10) words = words.filter((word) => !describingWords.test(word));
  const short = words.join(" ").length > 10 ? words[words.length - 1] : words.join(" ");
  return capitalise(short || title);
}

function compactTag(page: SeoPage, incoming: IncomingView): CompactTag {
  const make = (kind: CompactTag["kind"], text: string): CompactTag => {
    const display = kind === "keyword";
    const split = text.includes(" ") && textEm(text, display) > 6.4;
    const lines = split ? [text.slice(0, text.indexOf(" ")), text.slice(text.indexOf(" ") + 1)] : [text];
    const icon = kind === "link" || kind === "team" || kind === "saved";
    const em = Math.max(...lines.map((line) => textEm(line, display))) * 1.04 + 1.1 + (icon ? 1.3 : 0);
    return { kind, lines, em: Math.round(em * 100) / 100 };
  };
  if (incoming.keyword) return make("keyword", incoming.keyword);
  if (isStoryMention(page)) return make("mention", "@yourbrand");
  const destination = destinationFor(page).title;
  if (destination !== "Resource page") return make("link", shortDestination(destination));
  if (page.topic === "team") return make("team", "Your team");
  return make("saved", collectsEmail(page) ? "Email" : "Answers");
}

/* ---------- The page's example, read once ---------- */

type ThumbLayout = "thread" | "builder";

type ThumbView = {
  page: SeoPage;
  context: ExampleContext;
  layout: ThumbLayout;
  icon: IconName;
  trigger: string;
  status: string;
  /** "Private reply", "Public reply" or "Reply": the builder's reply node. */
  replyTag: string;
  handle: string;
  incoming: IncomingView;
  reply: ReplyView;
  next: NextView;
  tag: CompactTag;
};

function thumbView(page: SeoPage): ThumbView {
  const incoming = incomingFor(page);
  return {
    page,
    context: exampleContext(page),
    layout: topicPosition(page) % 2 === 0 ? "thread" : "builder",
    icon: topicIcons[page.topic],
    trigger: triggerLabel(page),
    status: sentLabel(page),
    replyTag: replyLabel(page),
    handle: handleFor(page),
    incoming,
    reply: replyFor(page),
    next: nextFor(page),
    tag: compactTag(page, incoming),
  };
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** Text that stays on one line and ends in an ellipsis when it runs out of room. */
function OneLine({ children }: { children: ReactNode }) {
  return <span className={styles.oneLine}>{children}</span>;
}

/** Text that takes up to two lines, then ends in an ellipsis. */
function TwoLines({ children }: { children: ReactNode }) {
  return <span className={styles.twoLines}>{children}</span>;
}

/** The reply's words: the sent message, the action the automation takes, or the first of two test versions. */
function replyText(reply: ReplyView): string {
  if (reply.kind === "variants") return reply.variants[0]?.text ?? "";
  return reply.text;
}

/** The incoming words; a request word (GUIDE, MENU) in bold, as people type it. */
function IncomingWords({ incoming, handle }: { incoming: IncomingView; handle: string }) {
  if (incoming.kind === "event") return <>{eventLine(handle, incoming)}</>;
  return incoming.keyword === incoming.text ? <strong className={styles.word}>{incoming.text}</strong> : <>{incoming.text}</>;
}

/* ---------- Full snapshot: shared pieces ---------- */

function TriggerChip({ view }: { view: ThumbView }) {
  return (
    <p className={styles.trigger}>
      <span className={styles.triggerIcon}><Icon name={view.icon} size={14} /></span>
      <OneLine>{view.trigger}</OneLine>
    </p>
  );
}

/**
 * A card with the outcome stuck on its bottom-right corner, like a label on a
 * print. The wrapper leaves room under the card, so the sticker never covers
 * the card's words or the trigger chip above it.
 */
function WithStatus({ view, children, className }: { view: ThumbView; children: ReactNode; className?: string }) {
  return (
    <div className={cx(styles.stickered, className)}>
      {children}
      <MockStatus tone="ink" className={styles.status}>{view.status}</MockStatus>
    </div>
  );
}

/** The reply as it lands: an accent bubble, a dashed automation note, or versions A and B. */
function Reply({ view }: { view: ThumbView }) {
  const { reply } = view;
  if (reply.kind === "action") return <MockActionNote className={styles.action}><OneLine>{reply.text}</OneLine></MockActionNote>;
  if (reply.kind === "variants") {
    return (
      <div className={styles.versions}>
        {reply.variants.slice(0, 2).map((variant) => (
          <div className={styles.version} key={variant.label}>
            <span className={styles.versionTag}>{variant.label}</span>
            <MockBubble side="you" className={styles.reply}><OneLine>{variant.text}</OneLine></MockBubble>
          </div>
        ))}
      </div>
    );
  }
  return <MockBubble side="you" className={styles.reply}><OneLine>{reply.text}</OneLine></MockBubble>;
}

/**
 * What follows the reply in the conversation: a link button, a later message,
 * or (on a follower offer) the follow check that guards the resource. Prints
 * too short for it leave it out.
 */
function After({ view }: { view: ThumbView }) {
  const { next } = view;
  if (next.kind === "button") return <MockLinkButton className={cx(styles.button, styles.extra)}><OneLine>{next.label}</OneLine></MockLinkButton>;
  if (next.kind === "later") {
    return (
      <div className={cx(styles.later, styles.extra)}>
        <MockSystemLine icon="clock" className={styles.event}>{next.label}</MockSystemLine>
        <MockBubble side="you" className={styles.reply}><OneLine>{next.message}</OneLine></MockBubble>
      </div>
    );
  }
  if (view.page.topic === "followers") return <MockToggleRow className={cx(styles.toggle, styles.extra)} label="Follow check" />;
  return null;
}

/** A step for the business after the reply, as Linkar notes it: under a DM thread, in tall prints only. */
function Note({ view }: { view: ThumbView }) {
  const { next } = view;
  if (next.kind !== "note" || view.page.topic === "facebook" || view.page.topic === "followers") return null;
  return <MockNextNote className={styles.note} tag={next.tag}><OneLine>{next.label}</OneLine></MockNextNote>;
}

/** The incoming message in a thread: the person's avatar beside a grey bubble, or a muted event line. */
function Incoming({ view }: { view: ThumbView }) {
  if (view.incoming.kind === "event") return <MockSystemLine className={styles.event}><IncomingWords incoming={view.incoming} handle={view.handle} /></MockSystemLine>;
  return (
    <div className={styles.them}>
      <MockAvatar name={view.handle} size={28} />
      <MockBubble side="them" className={styles.theirBubble}><TwoLines><IncomingWords incoming={view.incoming} handle={view.handle} /></TwoLines></MockBubble>
    </div>
  );
}

/* ---------- Full snapshot: the conversation ---------- */

/** A comment on the post, then the private reply it gets; in tall prints, a step for the business under it. */
function PostScene({ view }: { view: ThumbView }) {
  return (
    <>
      <WithStatus view={view} className={styles.lead}>
        {view.incoming.kind === "event"
          ? <MockCard className={styles.eventCard}><MockSystemLine><IncomingWords incoming={view.incoming} handle={view.handle} /></MockSystemLine></MockCard>
          : <MockComment className={styles.comment} handle={view.handle} reply={false} text={<IncomingWords incoming={view.incoming} handle={view.handle} />} />}
      </WithStatus>
      <div className={styles.answer}>
        <Reply view={view} />
        <After view={view} />
      </div>
      <Note view={view} />
    </>
  );
}

/** A DM thread: the message, the reply under it, and what follows; a step for the business under the thread. */
function InboxScene({ view }: { view: ThumbView }) {
  return (
    <>
      <WithStatus view={view} className={styles.lead}>
        <MockCard className={styles.thread}>
          <Incoming view={view} />
          <Reply view={view} />
          <After view={view} />
        </MockCard>
      </WithStatus>
      <Note view={view} />
    </>
  );
}

/** The Story beside the thread it starts: a reply to your Story, or a mention in theirs. */
function StoryScene({ view }: { view: ThumbView }) {
  const mention = view.incoming.kind === "event";
  return (
    <div className={cx(styles.lead, styles.storyScene)}>
      <div className={styles.story}>
        <span className={styles.storyBars}><i /><i /><i /></span>
        <span className={styles.storyOwner}>
          <MockAvatar name={mention ? view.handle : "yourbrand"} size={22} />
          <OneLine>{mention ? view.handle : "yourbrand"}</OneLine>
        </span>
        <span className={styles.storySticker}>{mention ? "@yourbrand" : view.incoming.keyword ?? "Ask me"}</span>
      </div>
      <WithStatus view={view} className={styles.storyThread}>
        <MockCard className={styles.thread}>
          <Incoming view={view} />
          <Reply view={view} />
          <After view={view} />
        </MockCard>
      </WithStatus>
    </div>
  );
}

/** A Facebook Page post's comments: the question, and the Page's public reply under it. */
function PageScene({ view }: { view: ThumbView }) {
  return (
    <WithStatus view={view} className={styles.lead}>
      <MockCard className={styles.fbCard}>
        <p className={styles.fbPost}>
          <MockPageAvatar size={22} />
          <strong>Your Page</strong>
          <small>Page post</small>
        </p>
        <MockPublicComment className={styles.fbComment} name={view.handle} text={<IncomingWords incoming={view.incoming} handle={view.handle} />} />
        <MockPublicComment className={styles.fbComment} name="Your Page" author meta="" text={<OneLine>{replyText(view.reply)}</OneLine>} />
      </MockCard>
    </WithStatus>
  );
}

const scenes: Record<ExampleContext, (props: { view: ThumbView }) => ReactNode> = {
  post: PostScene,
  inbox: InboxScene,
  story: StoryScene,
  page: PageScene,
};

/* ---------- Full snapshot: Linkar's builder ---------- */

/** What starts the automation, as the trigger step shows it: the request word, the message, or the event. */
function TriggerExample({ view }: { view: ThumbView }) {
  const { incoming } = view;
  if (incoming.keyword) {
    return (
      <p className={cx(styles.nodeKeyword, styles.triggerExample)}>
        <span className={styles.nodeLabel}>{view.context === "page" || view.context === "post" ? "Comment" : "Message"}</span>
        <MockKeyword className={styles.keyword}>{incoming.keyword}</MockKeyword>
      </p>
    );
  }
  if (incoming.kind === "event") return <MockSystemLine className={cx(styles.nodeEvent, styles.triggerExample)}><IncomingWords incoming={incoming} handle={view.handle} /></MockSystemLine>;
  return (
    <div className={cx(styles.them, styles.triggerExample)}>
      <MockAvatar name={view.handle} size={28} />
      <MockBubble side="them" className={styles.theirBubble}><TwoLines>{incoming.text}</TwoLines></MockBubble>
    </div>
  );
}

/**
 * The same automation as Linkar builds it: a trigger step with what starts it,
 * a wire, then the reply step with the reply and its link. Side by side in wide
 * prints, stacked otherwise.
 */
function Builder({ view }: { view: ThumbView }) {
  return (
    <div className={styles.builder}>
      <MockCard className={styles.node}>
        <p className={styles.nodeHead}>
          <span className={styles.nodeStep}>1</span>
          <span className={styles.nodeTrigger}><span className={styles.triggerIcon}><Icon name={view.icon} size={12} /></span><TwoLines>{view.trigger}</TwoLines></span>
        </p>
        <TriggerExample view={view} />
      </MockCard>
      <span className={styles.wire} aria-hidden="true" />
      <WithStatus view={view} className={styles.nodeWrap}>
        <MockCard className={styles.node}>
          <p className={styles.nodeHead}>
            <span className={styles.nodeStep}>2</span>
            <span className={styles.nodeReply}><span className={styles.replyMark}><LinkarMark size={9} /></span><OneLine>{view.replyTag}</OneLine></span>
          </p>
          <Reply view={view} />
          {view.next.kind === "button" ? <MockLinkButton className={cx(styles.button, styles.nodeButton)}><OneLine>{view.next.label}</OneLine></MockLinkButton> : null}
        </MockCard>
      </WithStatus>
    </div>
  );
}

function FullForm({ view }: { view: ThumbView }) {
  const Scene = scenes[view.context];
  return (
    <div className={styles.full}>
      <div className={styles.stage} data-layout={view.layout}>
        <div className={styles.block}>
          {view.layout === "builder" ? <Builder view={view} /> : (
            <>
              <TriggerChip view={view} />
              <Scene view={view} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------- Row form: the message and the reply ---------- */

function RowForm({ view }: { view: ThumbView }) {
  return (
    <div className={styles.row}>
      <span className={styles.rowBadge}><Icon name={view.icon} size={12} /></span>
      <span className={styles.rowIn} data-event={view.incoming.kind === "event" ? "true" : undefined}>
        <TwoLines><IncomingWords incoming={view.incoming} handle={view.handle} /></TwoLines>
      </span>
      <span className={styles.rowOut} data-kind={view.reply.kind}>
        {view.reply.kind === "action" ? <Icon name="bolt" size={10} /> : null}
        <TwoLines>{replyText(view.reply)}</TwoLines>
      </span>
    </div>
  );
}

/* ---------- Compact form: the topic icon and the request ---------- */

const tagIcons: Partial<Record<CompactTag["kind"], IconName>> = { link: "link", team: "user", saved: "check" };

function CompactForm({ view }: { view: ThumbView }) {
  const { tag } = view;
  const icon = tagIcons[tag.kind];
  return (
    <div className={styles.compact}>
      <span className={styles.compactIcon}><Icon name={view.icon} size={24} /></span>
      <span className={styles.compactTag} data-kind={tag.kind} data-lines={tag.lines.length} style={{ "--tag-em": tag.em } as CSSProperties}>
        {icon ? <Icon name={icon} size={10} /> : null}
        <span className={styles.compactText}>{tag.lines.map((line) => <span key={line}>{line}</span>)}</span>
      </span>
    </div>
  );
}

/**
 * The page's automation in miniature, filling its positioned parent. `size`
 * names the slot; inside it, container queries step down to a smaller form
 * when the box is too small for the one asked for. A parent whose print runs
 * off its panel sets `--thumb-bleed` to the hidden strip, and the picture keeps
 * clear of it.
 */
export function PageThumb({ page, size = "card", className }: { page: SeoPage; size?: PageThumbSize; className?: string }) {
  const view = thumbView(page);
  const style = { "--thumb-accent": topicVisuals[page.topic].accent, "--thumb-tint": topicTints[page.topic] } as CSSProperties;
  return (
    <div className={cx(styles.thumb, className)} data-size={size} data-context={view.context} data-layout={view.layout} data-topic={page.topic} style={style} aria-hidden="true">
      <div className={styles.view}>
        {size === "card" ? <FullForm view={view} /> : null}
        {size !== "mini" ? <RowForm view={view} /> : null}
        <CompactForm view={view} />
      </div>
    </div>
  );
}
