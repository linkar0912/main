import type { ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import { LinkarMark } from "../../../../linkar-mark";
import { Icon, MockAvatar, MockBubble, MockComment, MockNextContent, MockPageAvatar, MockPublicComment, MockSystemLine } from "../../mock-ui";
import { eventLine, exampleHandle, incomingFor, nextFor, nextIsPublic, postCaption, replyFor, triggerLabel, type IncomingView, type NextView, type ReplyView } from "../../seo-example";
import shell from "../../seo-section.module.css";
import { exampleHeader, exampleTitle } from "./copy";
import styles from "./flow.module.css";
import { AppTile, BrandAvatar, brandHandle, ExampleCaption, exampleContext, pageName, ReplyContent, replyName, replyVersions, type ExampleContext } from "./shared";

/*
 * The example as a journey across app screens on the lilac block: the request
 * where it arrives, the reply, then what follows it. A Facebook note that only
 * describes the public reply sits under that reply, so the journey has two
 * screens rather than an empty third. Each screen keeps the real example text
 * readable; the arrows between them are decoration.
 */

type Flow = { page: SeoPage; context: ExampleContext; handle: string; incoming: IncomingView; reply: ReplyView; next: NextView };

type Screen = {
  app: "instagram" | "facebook" | "linkar";
  bar: string;
  title: string;
  body: ReactNode;
  /** The label on the arrow that leads to the next screen. */
  link?: string;
  /** A sticker on the screen's corner: the trigger that starts the journey. */
  sticker?: string;
};

const flowSub = "Follow one request from the moment it arrives to the step after the reply.";

function requestTitle({ context, incoming }: Flow): string {
  if (context === "post" || context === "page") return "They comment on your post";
  if (context === "story") return incoming.kind === "event" ? "They mention you in their Story" : "They reply to your Story";
  return incoming.kind === "event" ? "They ask for it" : "They send you a message";
}

function replyTitle({ context, reply }: Flow): string {
  if (context === "page") return "Your Page answers in public";
  if (reply.kind === "variants") return "Two versions of the reply";
  if (reply.kind === "action") return "Your automation takes over";
  return context === "post" ? "A private reply arrives" : "Your reply arrives";
}

function nextTitle({ next }: Flow): string {
  if (next.kind === "button") return "They tap through";
  if (next.kind === "later") return "A follow-up comes later";
  return "What happens next";
}

/** A Story frame in miniature: no photo, so the page's own pictures never repeat here. */
function MiniStory({ mention }: { mention: boolean }) {
  return (
    <span className={styles.miniStory} aria-hidden="true">
      <span className={styles.miniBars}><i /><i /><i /></span>
      {mention ? <span className={styles.miniSticker}>@{brandHandle}</span> : <span className={styles.miniOwner} />}
    </span>
  );
}

function RequestBody(flow: Flow) {
  const { page, context, handle, incoming } = flow;
  if (context === "post" || context === "page") {
    return (
      <>
        <div className={styles.captionRow} aria-hidden="true">
          {context === "page" ? <MockPageAvatar size={30} /> : <BrandAvatar size={28} />}
          <p><strong>{context === "page" ? pageName : brandHandle}</strong> {postCaption(page)}</p>
        </div>
        {incoming.kind === "event"
          ? <MockSystemLine className={styles.event}>{eventLine(handle, incoming)}</MockSystemLine>
          : context === "page"
            ? <MockPublicComment className={styles.fresh} name={handle} text={incoming.text} />
            : <MockComment className={styles.flatComment} handle={handle} text={incoming.text} time="now" />}
      </>
    );
  }
  if (context === "story") {
    const mention = incoming.kind === "event";
    return (
      <div className={styles.storyRow}>
        <MiniStory mention={mention} />
        <div className={styles.storyText}>
          <p className={styles.muted}>{mention ? "In their Story" : "Replied to your story"}</p>
          {mention
            ? <MockSystemLine className={styles.event}>{eventLine(handle, incoming)}</MockSystemLine>
            : <MockBubble side="them"><span className={shell.srOnly}>{handle}: </span>{incoming.text}</MockBubble>}
        </div>
      </div>
    );
  }
  // An event is a muted status line, never a bubble beside an avatar.
  if (incoming.kind === "event") return <MockSystemLine className={styles.event}>{eventLine(handle, incoming)}</MockSystemLine>;
  return (
    <div className={styles.inRow}>
      <MockAvatar name={handle} size={30} />
      <MockBubble side="them"><span className={shell.srOnly}>{handle}: </span>{incoming.text}</MockBubble>
    </div>
  );
}

function ReplyBody(flow: Flow) {
  const { page, context, handle, reply, next } = flow;
  if (context === "page") {
    const texts = reply.kind === "variants" ? replyVersions(page, reply).map((version) => `${version.tag} ${version.text}`) : [reply.text];
    return (
      <>
        <p className={styles.muted} aria-hidden="true">Replying to {handle}</p>
        {texts.map((text) => (
          <MockPublicComment key={text} className={styles.pageReply} name={pageName} author text={<><span className={shell.srOnly}>Public reply: </span>{text}</>} />
        ))}
        {nextIsPublic(next) ? <MockNextContent next={next} className={styles.note} /> : null}
      </>
    );
  }
  return (
    <div className={styles.out}>
      <span className={shell.srOnly}>{replyName(page)}: </span>
      <ReplyContent page={page} reply={reply} />
    </div>
  );
}

function NextBody({ next }: Flow) {
  if (next.kind === "button") {
    return (
      <div className={styles.tapStage}>
        <MockNextContent next={next} className={styles.button} />
        <span className={styles.tap} aria-hidden="true" />
      </div>
    );
  }
  return <MockNextContent next={next} className={next.kind === "note" ? styles.note : styles.later} />;
}

function screensFor(flow: Flow): readonly Screen[] {
  const { context, handle, next } = flow;
  const facebook = context === "page";
  const dm = `${handle} · Messages`;
  // The note describes the public reply itself: it sits on the reply screen and there is no third screen.
  const twoScreens = nextIsPublic(next);
  const first: Screen = {
    app: facebook ? "facebook" : "instagram",
    bar: context === "post" || facebook ? "Comments" : context === "story" ? "Story activity" : "Messages",
    title: requestTitle(flow),
    body: <RequestBody {...flow} />,
    link: "Linkar replies",
    sticker: triggerLabel(flow.page),
  };
  const second: Screen = {
    app: facebook ? "facebook" : "instagram",
    bar: facebook ? "Comments" : dm,
    title: replyTitle(flow),
    body: <ReplyBody {...flow} />,
    link: twoScreens ? undefined : "Then",
  };
  if (twoScreens) return [first, second];
  const third: Screen = {
    app: next.kind === "note" ? "linkar" : "instagram",
    bar: next.kind === "note" ? "Your Linkar workspace" : dm,
    title: nextTitle(flow),
    body: <NextBody {...flow} />,
  };
  return [first, second, third];
}

export function ExampleFlow({ page }: { page: SeoPage }) {
  const flow: Flow = {
    page,
    context: exampleContext(page),
    handle: exampleHandle(page),
    incoming: incomingFor(page),
    reply: replyFor(page),
    next: nextFor(page),
  };
  const screens = screensFor(flow);
  return (
    <section className={`${shell.section} ${shell.lilac} ${shell.grid} ${styles.section}`} id="example" aria-labelledby="conversation-title">
      <div className={shell.frame}>
        <header className={`${shell.headSplit} ${styles.head}`}>
          <div>
            <p className={shell.monoPill}>{exampleHeader.eyebrow}</p>
            <h2 id="conversation-title" className={shell.h2}>{exampleTitle(page)}</h2>
          </div>
          <p className={shell.sub}>{flowSub}</p>
        </header>
        <figure className={styles.figure}>
          <ol className={styles.track} data-count={screens.length}>
            {screens.map((screen, index) => (
              <li className={styles.stage} key={screen.title}>
                <div className={styles.meta}>
                  <span className={styles.num} aria-hidden="true">{index + 1}</span>
                  <h3 className={styles.title}>{screen.title}</h3>
                </div>
                <div className={styles.screen}>
                  <p className={styles.bar} aria-hidden="true">
                    <AppTile app={screen.app}>{screen.app === "linkar" ? <LinkarMark size={12} /> : screen.app === "instagram" ? <Icon name="comment" size={13} /> : null}</AppTile>
                    <span>{screen.bar}</span>
                    <span className={styles.barDots}><i /><i /><i /></span>
                  </p>
                  <div className={styles.body}>{screen.body}</div>
                  {screen.sticker ? <span className={styles.sticker} aria-hidden="true"><Icon name="bolt" size={14} />{screen.sticker}</span> : null}
                  {screen.link ? (
                    <span className={styles.link} aria-hidden="true">
                      <span className={styles.linkLabel}>{screen.link}</span>
                      <span className={styles.arrow}><Icon name="arrow-right" size={20} /></span>
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
          <ExampleCaption page={page} tone="color" />
        </figure>
      </div>
    </section>
  );
}
