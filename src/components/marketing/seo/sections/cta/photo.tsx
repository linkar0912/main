import type { SeoPage } from "@/src/content/seo";
import { LinkarMark } from "../../../../linkar-mark";
import { Icon, MockKeyword, type IconName } from "../../mock-ui";
import {
  exampleContext, exampleHandle, incomingFor, nextFor, postCaption, replyFor, sentLabel, triggerLabel,
  type ExampleContext, type IncomingView, type NextView, type ReplyView,
} from "../../seo-example";
import shell from "../../seo-section.module.css";
import { topicVisuals } from "../../seo-theme";
import { ctaEyebrow, ctaPlans, ctaSub, type CtaTone } from "./copy";
import { CtaActions, CtaHeadline } from "./parts";
import styles from "./photo.module.css";

/*
 * The closing block, drawn in code: the page accent as a deep surface with the
 * grid, and soft Linkar UI around a calm centre. The trigger node says what
 * starts the page's automation; the phone shows the page's own conversation
 * (the handle, what they sent, the reply and what follows), ending on the
 * page's status. Every piece is decorative and keeps clear of the headline and
 * the plan cards.
 */

/** The page's example, as the phone draws it. Without a page every text is null and drawn as skeleton lines. */
type Thread = {
  context: ExampleContext;
  handle: string | null;
  incoming: IncomingView | null;
  reply: ReplyView | null;
  next: NextView | null;
  caption: string | null;
  sent: string;
};

function threadFor(page: SeoPage | undefined): Thread {
  if (!page) return { context: "inbox", handle: null, incoming: null, reply: null, next: null, caption: null, sent: topicVisuals.messages.sent };
  return {
    context: exampleContext(page),
    handle: exampleHandle(page),
    incoming: incomingFor(page),
    reply: replyFor(page),
    next: nextFor(page),
    caption: postCaption(page),
    sent: sentLabel(page),
  };
}

/** "requested the guide" as a line of its own: "Requested the guide". */
const sentence = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** A skeleton text line, `w` wide. */
function Bar({ w, tone }: { w: string; tone?: "ink" | "strong" }) {
  return <i className={styles.bar} data-tone={tone} style={{ inlineSize: w }} />;
}

/** Real page text, cut to `lines` lines; skeleton lines when there is none. */
function Words({ text, lines, bars, tone }: { text: string | null; lines: 1 | 2 | 3; bars: readonly string[]; tone?: "ink" }) {
  if (!text) return <>{bars.map((w, i) => <Bar key={i} w={w} tone={tone} />)}</>;
  return <span className={styles.words} data-lines={lines}>{text}</span>;
}

/** The message sent: the quoted reply, the first test version, or skeleton lines for a described action. */
function replyText(reply: ReplyView | null): string | null {
  if (!reply) return null;
  if (reply.kind === "variants") return reply.variants[0].text;
  return reply.kind === "quote" ? reply.text : null;
}

/** What follows the reply: the button, the later message, or the step for you. */
function NextShape({ next }: { next: NextView | null }) {
  if (next?.kind === "later") {
    return (
      <>
        <span className={styles.system}><Icon name="clock" size={12} /><span>{next.label}</span></span>
        <span className={styles.bubble} data-side="you"><Words text={next.message} lines={2} bars={["74%"]} tone="ink" /></span>
      </>
    );
  }
  if (next?.kind === "note") {
    return <span className={styles.noteShape}><span className={styles.noteTag}>{next.tag}</span><Words text={next.label} lines={1} bars={["54%"]} /></span>;
  }
  return <span className={styles.linkShape}><Icon name="link" size={14} /><Words text={next?.label ?? null} lines={1} bars={["58%"]} /></span>;
}

/** The page's own outcome ("Reply sent", "Details saved"): the one crisp label beside the reply. */
function SentChip({ label, className }: { label: string; className?: string }) {
  return (
    <span className={className ? `${styles.sent} ${className}` : styles.sent}>
      <span className={styles.sentIcon}><Icon name="check" size={13} /></span>
      {label}
    </span>
  );
}

/** What started the thread, as the business's inbox shows it above the reply. */
function Incoming({ thread }: { thread: Thread }) {
  const { context, incoming } = thread;
  const said = incoming ? (incoming.kind === "event" ? sentence(incoming.text) : incoming.text) : null;

  if (context === "post") {
    return (
      <span className={styles.refCard}>
        <span className={styles.refThumb} />
        <span className={styles.lines}>
          <span className={styles.muted}>Comment on your post</span>
          <Words text={said} lines={1} bars={["70%"]} />
        </span>
      </span>
    );
  }
  if (context === "story") {
    return (
      <span className={styles.storyRef}>
        <span className={styles.storyThumb}><i /></span>
        {incoming?.kind === "event"
          ? <span className={styles.muted}>{said}</span>
          : <span className={styles.bubble} data-side="them"><Words text={said} lines={2} bars={["64%"]} /></span>}
      </span>
    );
  }
  if (incoming?.kind === "event") return <span className={styles.system}><Icon name="send" size={12} /><span>{said}</span></span>;
  return <span className={styles.bubble} data-side="them"><Words text={said} lines={2} bars={["84%", "52%"]} /></span>;
}

/** The reply as the business sees it: a DM thread, or a Facebook Page post with its public reply. */
function PhoneScreen({ thread }: { thread: Thread }) {
  const status = <SentChip label={thread.sent} />;
  const reply = replyText(thread.reply);

  if (thread.context === "page") {
    return (
      <div className={styles.screen}>
        <span className={styles.postHead}>
          <span className={styles.pageDot} />
          <span className={styles.lines}><b className={styles.name}>Your Page</b><Words text={thread.caption} lines={1} bars={["62%"]} /></span>
        </span>
        <span className={styles.fbRow}>
          <span className={styles.dot} />
          <span className={styles.fbBubble}>{thread.handle ? <b className={styles.name}>{thread.handle}</b> : null}<Words text={thread.incoming?.text ?? null} lines={2} bars={["82%"]} /></span>
        </span>
        <span className={styles.fbRow} data-author="true">
          <span className={styles.pageDot} data-small="true" />
          <span className={styles.fbBubble} data-tone="you"><b className={styles.name}>Your Page</b><Words text={reply} lines={2} bars={["86%", "60%"]} tone="ink" /></span>
        </span>
        {status}
        <NextShape next={thread.next} />
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <span className={styles.chatHead}>
        <Icon name="back" size={16} />
        <span className={styles.dot} />
        <span className={styles.lines}>{thread.handle ? <b className={styles.name}>{thread.handle}</b> : <Bar w="52%" tone="strong" />}<Bar w="30%" /></span>
      </span>
      <Incoming thread={thread} />
      <span className={styles.bubble} data-side="you"><Words text={reply} lines={3} bars={["88%", "70%", "40%"]} tone="ink" /></span>
      {status}
      <NextShape next={thread.next} />
    </div>
  );
}

const triggerIcons: Record<ExampleContext, IconName> = { post: "comment", page: "comment", story: "sparkle", inbox: "send" };

/** "Comment with a follow check" as two even lines ("Comment with", "a follow check"); short labels stay on one. */
function labelLines(label: string): readonly string[] {
  const words = label.split(" ");
  if (label.length <= 16 || words.length < 2) return [label];
  let best = 1;
  for (let i = 1; i < words.length; i += 1) {
    const gap = (cut: number) => Math.abs(words.slice(0, cut).join(" ").length - words.slice(cut).join(" ").length);
    if (gap(i) < gap(best)) best = i;
  }
  return [words.slice(0, best).join(" "), words.slice(best).join(" ")];
}

/** Step one of the automation, as a soft builder node: what starts it, and the word people send when there is one. */
function TriggerNode({ context, label, keyword, className }: { context: ExampleContext; label: string; keyword: string | null; className: string }) {
  return (
    <div className={`${styles.trigger} ${className}`} data-keyword={keyword ? "true" : undefined}>
      <p className={styles.nodeHead}>
        <span className={styles.nodeStep}>1</span>
        <span className={styles.nodeType}>Trigger</span>
      </p>
      <p className={styles.nodeTitle}>
        <Icon name={triggerIcons[context]} size={16} />
        <span className={styles.nodeLabel}>{labelLines(label).map((line) => <span key={line}>{line}</span>)}</span>
      </p>
      {keyword ? <MockKeyword className={styles.keyword}>{keyword}</MockKeyword> : null}
    </div>
  );
}

/** The page's closing block: a calm centre for the headline, plans as glass cards, and Linkar UI drawn around them. */
export function CtaPhoto({ page, tone }: { page?: SeoPage; tone: CtaTone }) {
  const thread = threadFor(page);
  const trigger = page ? triggerLabel(page) : topicVisuals.messages.trigger;
  const keyword = thread.incoming?.keyword ?? null;

  return (
    <section className={`${shell.section} ${styles.section}`} data-tone={tone} data-context={thread.context} data-cta="photo" aria-labelledby="start-title">
      <div className={styles.backdrop} aria-hidden="true">
        <span className={styles.grid} />
        <div className={styles.phone}>
          <span className={styles.island} />
          <PhoneScreen thread={thread} />
        </div>
        <TriggerNode className={styles.floating} context={thread.context} label={trigger} keyword={keyword} />
      </div>

      {page ? (
        <div className={`${styles.glass} ${styles.start}`} aria-hidden="true">
          <span className={styles.startMark}><LinkarMark size={18} /></span>
          <span className={styles.startLabel}>Start with</span>
          <span className={styles.startName}>{page.label}</span>
        </div>
      ) : null}

      <div className={`${shell.frame} ${styles.content}`}>
        {/* Below laptops: the same story as a small flow above the eyebrow, from the trigger to the outcome. */}
        <div className={styles.flow} aria-hidden="true">
          <TriggerNode className={styles.compact} context={thread.context} label={trigger} keyword={keyword} />
          <SentChip className={styles.flowSent} label={thread.sent} />
        </div>
        <p className={`${shell.monoPill} ${styles.eyebrow}`}>{ctaEyebrow}</p>
        <CtaHeadline classes={{ title: styles.title, line: styles.line, mark: styles.mark }} />
        <p className={styles.sub}>{ctaSub}</p>
        <CtaActions className={`${shell.actions} ${styles.actions}`} primaryClassName={shell.inverseAction} secondaryClassName={`${shell.outlineAction} ${styles.outline}`} />
        <ul className={styles.plans} role="list" aria-label="Plans">
          {ctaPlans.map((plan) => (
            <li className={`${styles.glass} ${styles.plan}`} data-plan={plan.key} key={plan.key}>
              <p className={styles.planHead}><strong>{plan.name}</strong><span>{plan.price}</span><small>a month</small></p>
              <ul className={styles.checks} role="list">
                {plan.checks.map((check) => (
                  <li key={check}><span className={styles.checkIcon} aria-hidden="true"><Icon name="check" size={13} /></span>{check}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
