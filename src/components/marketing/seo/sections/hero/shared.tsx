import Link from "next/link";
import type { ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import { BILLING_PLANS } from "@/src/lib/billing/catalog";
import { ButtonRoll } from "../../../button-roll";
import { formatRupees } from "../../../pricing-format";
import {
  Icon, MockAvatar, MockBubble, MockCard, MockComment, MockNextContent, MockPanel, MockPublicComment, MockReplyContent, MockStatus,
} from "../../mock-ui";
import { HashLink } from "../../hash-link";
import { exampleHandle, incomingFor, nextFor, replyFor, replyLabel, sentLabel, triggerLabel, type ReplyView } from "../../seo-example";
import type { SeoCrumb } from "../../seo-layout";
import { isCommentTopic } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import styles from "./hero.module.css";

/* Pieces every hero variant shares: breadcrumb, headline, actions, proof line and the example UI. */

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

/**
 * `sizes` for the 4:5 photo card on the split and hub heroes. The sources are
 * landscape 3:2, so object-fit: cover needs about 1.9 times the card's width:
 * a 540x675 card shows a 1012px-wide image. 76vw tracks the smaller card on
 * 900 to 1199px screens; below 900 the card spans the column.
 */
export const PORTRAIT_CARD_SIZES = "(min-width: 1200px) 1020px, (min-width: 900px) 76vw, 100vw";

const cheapestPaidPaise = Math.min(...Object.values(BILLING_PLANS).map((plan) => plan.monthlyPaise));
export const heroProofLine = `Free to start. Paid plans from ${formatRupees(cheapestPaidPaise)} a month.`;

/**
 * Home / Collection. A hub shows its collection as the current crumb. A detail
 * hero passes `parentsOnly`: the trail stops at the collection link, because
 * the page label leads the H1 as its kicker and should show once. The
 * BreadcrumbList JSON-LD still lists the page itself.
 */
export function HeroBreadcrumb({ crumbs, parentsOnly = false, className }: { crumbs: readonly SeoCrumb[]; parentsOnly?: boolean; className?: string }) {
  const shown = parentsOnly ? crumbs.filter((crumb) => !crumb.current) : crumbs;
  return (
    <nav className={cx(styles.breadcrumb, parentsOnly && styles.parents, className)} aria-label="Breadcrumb">
      <ol>
        {shown.map((crumb) => (
          <li key={crumb.href}>
            {crumb.current
              ? <span aria-current="page">{crumb.label}</span>
              : <Link href={crumb.href}>{crumb.label}</Link>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Hyphenated words ("thank-you") never break at the hyphen. */
function keepHyphens(text: string): ReactNode {
  const parts = text.split(/(\S+-\S+)/);
  return parts.length === 1 ? text : parts.map((part, index) => (index % 2 === 1 ? <span key={index} className={styles.nowrap}>{part}</span> : part));
}

/** Length of the headline's longest word in letters, digits and hyphens. A hyphenated word counts whole: keepHyphens keeps it on one line. */
function longestWordLength(text: string): number {
  return Math.max(0, ...text.split(/\s+/).map((word) => word.replace(/[^\p{L}\p{N}-]/gu, "").length));
}

/**
 * One block per sentence, so a two-sentence headline never leaves a word of the second sentence on the first line.
 * data-longword: a word of 14 or more letters is wider than a phone column at the usual size, so phones step it down.
 * kicker: the page or hub label, first inside the H1 as the label pill, so the heading names what the page is about.
 * The space after it keeps the label and the headline apart in the heading's text; it never renders.
 * data-long and data-longword measure the headline only: the kicker has its own size.
 */
export function HeroTitle({ text, kicker, className, kickerClassName }: { text: string; kicker?: string; className?: string; kickerClassName?: string }) {
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  return (
    <h1
      id="seo-title"
      className={cx(styles.title, className)}
      data-long={text.length > 42 ? "true" : undefined}
      data-longword={longestWordLength(text) >= 14 ? "true" : undefined}
    >
      {kicker ? <><span className={cx(styles.kicker, kickerClassName)} data-kicker="">{kicker}</span>{" "}</> : null}
      {sentences.length > 1
        ? sentences.map((sentence, index) => <span key={sentence} className={styles.sentence}>{keepHyphens(index < sentences.length - 1 ? `${sentence} ` : sentence)}</span>)
        : keepHyphens(text)}
    </h1>
  );
}

export function HeroActions({ secondaryHref, secondaryLabel, className }: { secondaryHref: string; secondaryLabel: string; className?: string }) {
  return (
    <>
      <div className={cx(shell.actions, styles.actions, className)}>
        <a className={shell.inverseAction} href="/signup"><ButtonRoll label="Create your first reply" /></a>
        {secondaryHref.startsWith("#")
          ? <HashLink className={shell.textAction} href={secondaryHref as `#${string}`}>{secondaryLabel}<Icon name="arrow-right" size={18} /></HashLink>
          : <a className={shell.textAction} href={secondaryHref}>{secondaryLabel}<Icon name="arrow-right" size={18} /></a>}
      </div>
      <p className={styles.proof}>{heroProofLine}</p>
    </>
  );
}

/* Example UI. Decorative: the example section carries the readable copy. */

/** Whole sentences up to about `max` characters, never cut mid-word. The full reply shows in the example section. */
function shortText(text: string, max = 96): string {
  const sentences = text.match(/[^.!?]+[.!?]+[’”"')]*(?:\s+|$)/g)?.map((sentence) => sentence.trim()) ?? [text.trim()];
  let out = sentences[0] ?? text.trim();
  for (const sentence of sentences.slice(1)) {
    if (`${out} ${sentence}`.length > max) break;
    out = `${out} ${sentence}`;
  }
  return out;
}

function shortReply(reply: ReplyView, max?: number): ReplyView {
  return reply.kind === "quote" ? { kind: "quote", text: shortText(reply.text, max) } : reply;
}

const pastToPresent: Record<string, string> = {
  mentioned: "mention", requested: "request", messaged: "message", commented: "comment", replied: "reply", sent: "send",
  asked: "ask", shared: "share", tagged: "tag", followed: "follow", tapped: "tap", opened: "open", booked: "book", typed: "type",
};

/** "They comment GUIDE", "They mention you in their Story": the first numbered caption on the centred hero. */
function triggerCaption(page: SeoPage): string {
  const incoming = incomingFor(page);
  if (incoming.kind === "event") {
    const [verb, ...rest] = incoming.text.split(" ");
    return `They ${[pastToPresent[verb.toLowerCase()] ?? verb, ...rest].join(" ")}`;
  }
  const keyword = incoming.keyword;
  if (page.topic === "facebook") return keyword ? `They comment ${keyword}` : "They comment on your post";
  if (isCommentTopic(page.topic)) return keyword ? `They comment ${keyword}` : "They leave a comment";
  if (page.topic === "stories") return keyword ? `They reply ${keyword} to a Story` : "They reply to your Story";
  return keyword ? `They message ${keyword}` : "They send a message";
}

function replyCaption(page: SeoPage): string {
  if (page.topic === "facebook") return "Your Page replies in public";
  const reply = replyFor(page);
  if (reply.kind === "variants") return "Linkar tests two replies";
  if (page.topic === "comments" || page.topic === "followers") return "They get a private reply";
  return reply.kind === "action" ? "Linkar takes the next step" : "Linkar replies";
}

/** Who wrote in: a comment, a DM, a Story event, or a public Facebook comment. */
function IncomingWidget({ page, handle, look }: { page: SeoPage; handle: string; look: HeroLook }) {
  const incoming = incomingFor(page);
  if (page.topic === "facebook") {
    return (
      <MockCard className={cx(styles.widget, styles.fbCard)}>
        <MockPublicComment name={handle} text={incoming.kind === "event" ? `${handle} ${incoming.text}` : incoming.text} />
      </MockCard>
    );
  }
  if (incoming.kind === "event") {
    return (
      <MockCard className={cx(styles.widget, styles.event)}>
        <MockAvatar name={handle} size={34} />
        <p><strong>{handle}</strong> {incoming.text}</p>
        <span className={styles.eventTime}>now</span>
      </MockCard>
    );
  }
  if (isCommentTopic(page.topic)) return <MockComment className={styles.widget} handle={handle} text={incoming.text} />;
  if (look === "glass") {
    return (
      <div className={cx(styles.widget, styles.bubbleRow)}>
        <MockAvatar name={handle} size={30} />
        <MockBubble side="them" className={styles.floatBubble}>{incoming.text}</MockBubble>
      </div>
    );
  }
  return (
    <MockCard className={styles.widget}>
      <p className={styles.dmHead}>
        <MockAvatar name={handle} size={26} />
        <strong>{handle}</strong>
        <span>{page.topic === "stories" ? "replied to your Story" : "sent a message"}</span>
      </p>
      <MockBubble side="them">{incoming.text}</MockBubble>
    </MockCard>
  );
}

/** The reply and what follows it. Facebook Page replies stay public: a Page comment, never a message. */
function ReplyWidget({ page, look, title }: { page: SeoPage; look: HeroLook; title: string }) {
  const reply = replyFor(page);
  const next = nextFor(page);
  if (page.topic === "facebook") {
    const text = reply.kind === "quote" ? shortText(reply.text) : reply.kind === "action" ? reply.text : reply.variants[0].text;
    const body = (
      <>
        <MockPublicComment name="Your Page" author text={text} />
        <MockNextContent next={next} />
      </>
    );
    return look === "glass"
      ? <MockCard className={cx(styles.widget, styles.fbCard)}>{body}</MockCard>
      : <MockPanel className={styles.widget} title={title}>{body}</MockPanel>;
  }
  // On a photo, a faint "Later" line would vanish: it becomes a dark glass pill.
  const body = (
    <>
      <MockReplyContent reply={shortReply(reply)} />
      {look === "glass" && next.kind === "later"
        ? <><p className={styles.laterPill}><Icon name="clock" size={14} />{next.label}:</p><MockBubble side="you">{next.quoted}</MockBubble></>
        : <MockNextContent next={next} />}
    </>
  );
  return look === "glass"
    ? <div className={cx(styles.widget, styles.floatReply)}>{body}</div>
    : <MockPanel className={styles.widget} title={title}>{body}</MockPanel>;
}

/** Solutions: the page's journey as a small Linkar flow. When, reply, then. */
function FlowWidget({ page }: { page: SeoPage }) {
  const incoming = incomingFor(page);
  const reply = replyFor(page);
  const next = nextFor(page);
  const when = incoming.kind === "event" ? `Someone ${incoming.text}` : !incoming.keyword && incoming.text.length <= 44 ? `‘${incoming.text}’` : null;
  return (
    <MockPanel className={styles.widget} title={<>Your flow<span className={styles.live}>Live</span></>}>
      <ol className={styles.flowRows}>
        <li>
          <span className={styles.flowTag} data-tone="yellow">When</span>
          <span className={styles.flowText}>
            {triggerLabel(page)}
            {incoming.keyword ? <span className={styles.flowKeyword}>{incoming.keyword}</span> : null}
            {when ? <em>{when}</em> : null}
          </span>
        </li>
        <li>
          <span className={styles.flowTag} data-tone="lilac">Reply</span>
          <span className={styles.flowText}>
            {reply.kind === "quote" ? <span className={styles.flowQuote}>{shortText(reply.text, 60)}</span> : null}
            {reply.kind === "action" ? reply.text : null}
            {reply.kind === "variants" ? `Version ${reply.variants.map((variant) => variant.label).join(" or ")}` : null}
          </span>
        </li>
        <li>
          <span className={styles.flowTag} data-tone="mint">Then</span>
          <span className={styles.flowText}>
            {next.kind === "button" ? <span className={styles.flowLink}><Icon name="link" size={14} />{next.label}</span> : null}
            {next.kind === "later" ? next.source : null}
            {next.kind === "note" ? next.label : null}
          </span>
        </li>
      </ol>
    </MockPanel>
  );
}

/** Templates: the recipe as a checklist of its steps. */
function RecipeWidget({ page }: { page: SeoPage }) {
  return (
    <MockPanel className={styles.widget} title={<>Workflow recipe<span className={styles.recipeCount}>{page.steps.length} steps</span></>}>
      <ol className={styles.recipeSteps}>
        {page.steps.map(([title]) => (
          <li key={title}><span className={styles.recipeCheck}><Icon name="check" size={12} /></span><span>{title}</span></li>
        ))}
      </ol>
      <p className={styles.recipeFoot}><Icon name="download" size={15} />Download the plan</p>
    </MockPanel>
  );
}

/**
 * card: white cards over the photo's edges (split).
 * glass: bare bubbles floating on a full-bleed photo (fullbleed).
 * steps: cards with numbered captions, like a two-step story (centered).
 */
export type HeroLook = "card" | "glass" | "steps";

type HeroFamily = { first: ReactNode; second: ReactNode; keep: "first" | "second"; captions: readonly [string, string]; status: string | null };

/**
 * Each collection draws a different pair, so a feature, a solution and a
 * recipe on the same topic never look alike. Features: who wrote in and the
 * reply. Solutions: who wrote in and the flow that answers. Templates: the
 * recipe and its sample reply. `keep` is the one widget phones show.
 */
function heroFamily(page: SeoPage, look: HeroLook): HeroFamily {
  if (page.collection === "templates") {
    return {
      first: <RecipeWidget page={page} />,
      second: <ReplyWidget page={page} look={look} title="Sample reply" />,
      keep: "first",
      captions: [`Set it up in ${page.steps.length} steps`, replyCaption(page)],
      status: null,
    };
  }
  const solutions = page.collection === "solutions";
  const label = replyLabel(page);
  return {
    first: <IncomingWidget page={page} handle={exampleHandle(page, solutions ? 1 : 0)} look={look} />,
    second: solutions ? <FlowWidget page={page} /> : <ReplyWidget page={page} look={look} title={label === "Reply" ? "Your reply" : label} />,
    keep: "second",
    captions: [triggerCaption(page), solutions ? "Your flow answers" : replyCaption(page)],
    status: sentLabel(page),
  };
}

export type HeroWidgetClasses = { root?: string; first: string; second: string };

/** The example UI over a hero photo. Variants place `first` and `second`; phones keep one. */
export function HeroWidgets({ page, look, classes }: { page: SeoPage; look: HeroLook; classes: HeroWidgetClasses }) {
  const family = heroFamily(page, look);
  const caption = (index: 0 | 1) => look === "steps"
    ? <p className={styles.caption}><b>{index + 1}</b>{family.captions[index]}</p>
    : null;
  return (
    <div className={cx(styles.widgets, classes.root)} data-look={look} data-keep={family.keep} aria-hidden="true">
      <div className={cx(styles.first, classes.first)}>
        {caption(0)}
        {family.first}
        {look !== "steps" && family.status ? <MockStatus className={styles.status} tone={look === "glass" ? "ink" : "yellow"}>{family.status}</MockStatus> : null}
      </div>
      <div className={cx(styles.second, classes.second)}>
        {caption(1)}
        {family.second}
      </div>
    </div>
  );
}
