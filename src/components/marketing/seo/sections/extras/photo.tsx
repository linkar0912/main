import type { CSSProperties } from "react";
import { seoPages, type SeoPage } from "@/src/content/seo";
import { LinkarMark } from "../../../../linkar-mark";
import { Icon, MockAvatar } from "../../mock-ui";
import { exampleContext, exampleHandle, incomingFor, isStoryMention, nextFor, replyFor, replyLabel, sentLabel, triggerLabel, type ExampleContext, type NextView, type ReplyView } from "../../seo-example";
import { detailLayout, fnv1a } from "../../seo-layout";
import { topicLine, topicVisuals } from "../../seo-theme";
import { collectsEmail, destinationFor } from "../benefits/outcomes";
import shell from "../../seo-section.module.css";
import styles from "./photo.module.css";

/*
 * The statement band: a large white line on Linkar's dark canvas, with the
 * page's own automation drawn around it, never behind it. The same request
 * arrives again and again; one of them is lit (who asked, and what they
 * said), and every one is wired into Linkar, which replies.
 *
 * Wide screens wrap the flow around the headline: the requests hang from a
 * wire on the far left of the top strip, the wire drops down the left edge
 * into Linkar at the bottom, and the reply node waits at the bottom right.
 * The headline sits in the middle band, which the padding keeps clear, so no
 * wire ever crosses it. Phones and tablets read it top to bottom on a column.
 */

/* ---------- What the chips say ---------- */

/** What the lit person did, as a notification reads it, and what they wrote. */
type Event = { action: string; quote: string | null };

const eventActions: Record<ExampleContext, string> = {
  post: "commented",
  page: "commented",
  story: "replied to your Story",
  inbox: "messaged you",
};

function eventFor(page: SeoPage): Event {
  const incoming = incomingFor(page);
  if (incoming.kind === "event") return { action: incoming.text, quote: null };
  return { action: eventActions[exampleContext(page)], quote: incoming.text };
}

/** What happened, from the page's own example: the link it sent, or the topic's status line. */
function outcomeFor(page: SeoPage): string {
  if (isStoryMention(page)) return "Thank you sent";
  if (nextFor(page).kind === "button" && !collectsEmail(page)) return `${destinationFor(page).title} link sent`;
  return sentLabel(page);
}

/** The short status an earlier conversation shows in the activity list. */
function statusFor(page: SeoPage): string {
  return nextFor(page).kind === "button" && !collectsEmail(page) ? "Link sent" : sentLabel(page);
}

/** The statement on the band (seeded, see `topicLine`). A Story mention page thanks the person instead. */
function statementFor(page: SeoPage): string {
  return isStoryMention(page) ? "A mention is a small favour. Say thank you." : topicLine(page, "statementLines");
}

/* ---------- Where things sit ---------- */

/*
 * Pages on one topic share their copy's shape, so each gets a different look:
 * which request is lit, how far each request hangs from the wire, where the
 * reply node and its outcome sit, and which side of the column leads on
 * phones. Looks are dealt in turn to the topic's statement pages across the
 * collections, so up to six of them never share one.
 */
type Look = {
  /** The lit request's place in the wide wall. */
  lit: 0 | 1 | 2;
  /** How far each request in the wide wall hangs from the wire, in px. */
  reach: readonly [number, number, number];
  /** The reply node's distance from the stage's right edge on wide screens. */
  nodeEnd: string;
  /** Which corner of the reply node the outcome chip hangs from. */
  outcome: "start" | "end";
  /** Which side of the column the higher request sits on, on phones and tablets. */
  lead: "start" | "end";
  /** The lit chip's tilt, in degrees. */
  tilt: number;
  /** Which of the topic's other handles is lit (the hero uses the first). */
  handle: 1 | 2;
};

const looks: readonly Look[] = [
  { lit: 1, reach: [28, 60, 36], nodeEnd: "6%", outcome: "end", lead: "start", tilt: -2, handle: 1 },
  { lit: 0, reach: [28, 48, 84], nodeEnd: "10%", outcome: "start", lead: "end", tilt: 1.5, handle: 2 },
  { lit: 2, reach: [64, 28, 44], nodeEnd: "8%", outcome: "start", lead: "end", tilt: -1.5, handle: 2 },
  { lit: 0, reach: [40, 76, 28], nodeEnd: "5%", outcome: "end", lead: "start", tilt: 2, handle: 1 },
  { lit: 2, reach: [36, 64, 28], nodeEnd: "7%", outcome: "end", lead: "start", tilt: 1.5, handle: 1 },
  { lit: 1, reach: [72, 36, 56], nodeEnd: "9%", outcome: "start", lead: "end", tilt: 2, handle: 2 },
];

function lookFor(page: SeoPage): Look {
  const key = (candidate: SeoPage) => `${candidate.collection}/${candidate.slug}`;
  const group = seoPages
    .filter((candidate) => candidate.topic === page.topic && detailLayout(candidate).extras.includes("photo"))
    .map(key)
    .sort();
  const start = fnv1a(`${page.topic}:statement`);
  return looks[(start + Math.max(0, group.indexOf(key(page)))) % looks.length];
}

/*
 * Phones and tablets: the lit chip at the top, the two other requests either
 * side of the column wired into Linkar, then the trigger, the headline, and
 * the reply node at the foot. x is in % of the column, y in px from the top
 * (matching the CSS), so a long headline never pushes into them.
 */
const narrowRowY = [128, 150] as const;
/** The top of the Linkar tile, where the column's wires meet (`.hub` in the CSS). */
const narrowTileTop = 200;

/** A wire that leaves a row sideways and arrives at the tile from above. */
function intoTile(x: number, y: number): string {
  return `M${x} ${y}C${x + (50 - x) * .9} ${y} 50 ${y + (narrowTileTop - y) * .4} 50 ${narrowTileTop}`;
}

/** The wall fades as it nears the headline. */
const wallFade = [.72, .58, .46] as const;

const vars = (entries: Record<string, string | number>) => entries as CSSProperties;

/* ---------- The UI ---------- */

/** One incoming request, drawn the way its channel shows it: a comment, a Page comment, a Story reply or a DM. */
function WallRow({ context, name, text, className, style, side, high }: {
  context: ExampleContext; name: string | null; text: string; className?: string; style?: CSSProperties;
  /** Phones and tablets: the column side the row sits on, and whether it is the higher of the two. */
  side?: "start" | "end"; high?: boolean;
}) {
  return (
    <div className={`${styles.row} ${className ?? ""}`} data-context={context} data-column={side} data-high={high === undefined ? undefined : String(high)} style={style}>
      {name ? <MockAvatar name={name} size={28} className={styles.rowAvatar} /> : <span className={styles.rowAvatar} data-blank="true" />}
      <span className={styles.rowText}>
        {name ? <strong>{name}</strong> : <i className={styles.skeleton} />}
        <span>{text}</span>
      </span>
      {context === "post" ? <Icon name="heart" size={13} className={styles.rowMeta} /> : null}
      {context === "inbox" ? <i className={styles.unread} /> : null}
    </div>
  );
}

/** The lit request: who asked and what they wrote, as a glass notification. */
function EventChip({ handle, event, tilt }: { handle: string; event: Event; tilt: number }) {
  return (
    <div className={`${styles.glass} ${styles.event}`} style={vars({ "--tilt": `${tilt}deg` })}>
      <MockAvatar name={handle} size={30} />
      <p>
        <strong>{handle}</strong> {event.action}{event.quote ? <>: <span className={styles.quote}>“{event.quote}”</span></> : null}
      </p>
    </div>
  );
}

/** The reply itself: a sent DM bubble, or on a Page post the Page's own comment in the thread. */
function ReplyBody({ reply, publicReply }: { reply: ReplyView; publicReply: boolean }) {
  if (reply.kind === "quote" && publicReply) return <p className={styles.bubble} data-public="true"><strong>Your Page</strong><span>{reply.text}</span></p>;
  if (reply.kind === "quote") return <p className={styles.bubble}><span>{reply.text}</span></p>;
  if (reply.kind === "action") return <p className={styles.action}><Icon name="bolt" size={13} /><span>{reply.text}</span></p>;
  return (
    <div className={styles.versions}>
      {reply.variants.map((variant) => (
        <p className={styles.version} key={variant.label}><span className={styles.versionTag}>{variant.label}</span><span className={styles.bubble}><span>{variant.text}</span></span></p>
      ))}
    </div>
  );
}

function NextBody({ next }: { next: NextView }) {
  if (next.kind === "button") return <p className={styles.button}><Icon name="link" size={14} /><span>{next.label}</span></p>;
  if (next.kind === "later") return <p className={styles.next}><Icon name="clock" size={13} /><span>{next.label}: {next.quoted}</span></p>;
  return <p className={styles.next}><span className={styles.nextTag}>{next.tag}</span><span>{next.label}</span></p>;
}

/** The reply as a node in Linkar's builder: step, type chip and channel, then what the person receives. */
function ReplyNode({ page }: { page: SeoPage }) {
  const label = replyLabel(page);
  return (
    <div className={styles.node}>
      <p className={styles.nodeHead}>
        <span className={styles.nodeStep}>2</span>
        <span className={styles.nodeType}>{label === "Reply" ? "Message" : label}</span>
        <span className={styles.nodeChannel}><Icon name={page.topic === "facebook" ? "comment" : "send"} size={13} />{topicVisuals[page.topic].channel}</span>
      </p>
      <ReplyBody reply={replyFor(page)} publicReply={exampleContext(page) === "page"} />
      <NextBody next={nextFor(page)} />
    </div>
  );
}

/** Builder chrome for the top right on wide screens: the automation is on, and earlier requests were answered. */
function LivePanel({ names, status }: { names: readonly string[]; status: string }) {
  return (
    <div className={styles.panel}>
      <p className={styles.panelHead}>
        <span className={styles.panelMark}><LinkarMark size={13} /></span>
        <span>Automation live</span>
        <span className={styles.switch}><i /></span>
      </p>
      <ul className={styles.activity}>
        {names.map((name) => (
          <li key={name}>
            <MockAvatar name={name} size={22} />
            <span className={styles.activityName}>{name}</span>
            <span className={styles.activityStatus}><Icon name="check" size={11} />{status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ExtraPhoto({ page }: { page: SeoPage }) {
  const look = lookFor(page);
  const context = exampleContext(page);
  const text = incomingFor(page).text;
  // The hero uses the first handle; the lit moment belongs to someone else, and the wall to everyone.
  const handle = exampleHandle(page, look.handle);
  const others = [exampleHandle(page, look.handle === 1 ? 2 : 1), exampleHandle(page, 0)] as const;
  const faint: readonly (string | null)[] = [others[0], others[1]];
  // The wide wall: the lit request at its place, the two others around it; each knows its wire.
  const wall = [0, 1, 2].map((index) => {
    const lit = index === look.lit;
    const name = lit ? handle : faint[index < look.lit ? index : index - 1];
    return { index, lit, name, live: index >= look.lit, reach: look.reach[index] };
  });
  const lead = look.lead === "start";
  return (
    <section className={`${shell.section} ${shell.grid} ${styles.section}`} id="statement" aria-labelledby="statement-title" data-topic={page.topic} data-context={context}
      style={vars({ "--node-end": look.nodeEnd })}>
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.stage} aria-hidden="true">
        {/* Phones and tablets: the column's wires. */}
        <svg className={styles.fan} viewBox={`0 0 100 ${narrowTileTop}`} preserveAspectRatio="none" focusable="false">
          <path d={intoTile(46.5, narrowRowY[lead ? 0 : 1])} vectorEffect="non-scaling-stroke" />
          <path d={intoTile(53.5, narrowRowY[lead ? 1 : 0])} vectorEffect="non-scaling-stroke" />
        </svg>
        <span className={styles.drop} />
        {faint.map((name, index) => (
          <WallRow key={`n${index}`} className={styles.narrow} context={context} name={name} text={text}
            side={index === 0 ? "start" : "end"} high={lead === (index === 0)}
            style={vars({ "--y": `${narrowRowY[lead === (index === 0) ? 0 : 1]}px`, "--fade": lead === (index === 0) ? .7 : .55 })} />
        ))}

        {/* Wide: the wall hangs from the wire on the far left, which runs down into Linkar. */}
        <div className={styles.wall}>
          {wall.map((slot) => (
            <div key={slot.index} className={styles.slot} style={vars({ "--reach": `${slot.reach}px` })}
              data-first={slot.index === 0 ? "true" : undefined} data-lit={slot.lit ? "true" : undefined} data-live={slot.live ? "true" : undefined}>
              <i className={styles.wireIn} />
              <i className={styles.wireOut} />
              {slot.lit
                ? <EventChip handle={handle} event={eventFor(page)} tilt={look.tilt} />
                : <WallRow context={context} name={slot.name} text={text} style={vars({ "--fade": wallFade[slot.index] })} />}
            </div>
          ))}
          <span className={styles.run} />
        </div>
        <span className={styles.liveWire} />

        <div className={styles.hub}>
          <span className={styles.tile}><LinkarMark size={20} /></span>
          <span className={`${styles.glass} ${styles.trigger}`}><Icon name="bolt" size={14} />{triggerLabel(page)}</span>
        </div>

        <ReplyNode page={page} />
        <div className={`${styles.glass} ${styles.outcome}`} data-corner={look.outcome}>
          <Icon name="sparkle" size={18} />
          <p>{outcomeFor(page)}</p>
        </div>

        <LivePanel names={others} status={statusFor(page)} />
      </div>

      <div className={`${shell.frame} ${styles.content}`}>
        <p className={`${shell.monoPill} ${styles.label}`}>{page.label}</p>
        <h2 id="statement-title" className={`${shell.h2} ${styles.title}`}>{statementFor(page)}</h2>
      </div>
    </section>
  );
}
