"use client";

import { useEffect, useRef, useState } from "react";
import { storyChapters, type StoryChapter } from "./marketing-content";
import { Reveal } from "./reveal";
import styles from "./automation-story.module.css";

type AutomationStoryProps = {
  chapters?: readonly StoryChapter[];
};

/**
 * Screen-reader copy for the four decorative phones. The frames themselves are
 * aria-hidden, so this list is the only accessible description of the flow and
 * has to stay true to what each screen actually shows.
 */
const sceneSummaries = {
  comment: [
    'Comment “GUIDE please”',
    'Condition “Keyword matched”',
    'Private reply “The quick guide is ready. What would you like to improve first?”',
  ],
  qualify: [
    'Question “More replies or better leads?”',
    'Tapped reply “Better leads”',
    'Memory “Goal saved”',
  ],
  followup: [
    'Timeline “Now: guide sent”',
    'Timeline “+ 18h: check in”',
    'Status “Within window”',
  ],
  handoff: [
    'Signal “Project details received”',
    'Action “Automation paused”',
    'Queue “Ready for you”',
  ],
} as const satisfies Record<StoryChapter["scene"], readonly [string, string, string]>;

/**
 * Instagram's own icon set, drawn here rather than typed as text glyphs (♡ ⌁ ☆).
 * Text glyphs pick up whatever the fallback font has and read as characters, not
 * controls - the single biggest tell that a phone mockup is a mockup. All are
 * 24x24, stroked in currentColor at Instagram's weight, so one `size` prop and
 * the parent's text colour place them anywhere.
 */
const iconPaths = {
  heart: "M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 7.5 6.3Z",
  bubble: "M20.5 11.6c0 4.2-3.8 7.6-8.5 7.6a9.6 9.6 0 0 1-2.6-.35L4.8 20.5l1.2-3.4a7.2 7.2 0 0 1-2.5-5.5C3.5 7.4 7.3 4 12 4s8.5 3.4 8.5 7.6Z",
  plane: "M21 4 3 10.6l6.6 2.3M21 4l-6.5 16-3.6-6.4M21 4 9.9 12.9m0 0v5.3l2-3.7",
  bookmark: "M6.5 3.5h11a.6.6 0 0 1 .6.6v16.1l-6.1-4.4-6.1 4.4V4.1a.6.6 0 0 1 .6-.6Z",
  back: "M14.5 4.5 7 12l7.5 7.5",
  video: "M3.5 8.4a1.9 1.9 0 0 1 1.9-1.9h7.4a1.9 1.9 0 0 1 1.9 1.9v7.2a1.9 1.9 0 0 1-1.9 1.9H5.4a1.9 1.9 0 0 1-1.9-1.9Zm11.2 2.4 5.8-3.2v9.8l-5.8-3.2Z",
  call: "M20.3 16.4v2.4a1.6 1.6 0 0 1-1.8 1.6 15.6 15.6 0 0 1-6.8-2.4 15.3 15.3 0 0 1-4.7-4.7A15.6 15.6 0 0 1 4.6 6.4 1.6 1.6 0 0 1 6.2 4.6h2.4a1.6 1.6 0 0 1 1.6 1.4c.1.8.3 1.5.6 2.2a1.6 1.6 0 0 1-.4 1.7l-1 1a12.5 12.5 0 0 0 4.7 4.7l1-1a1.6 1.6 0 0 1 1.7-.4c.7.3 1.4.5 2.2.6a1.6 1.6 0 0 1 1.3 1.6Z",
  camera: "M4 8.4a1.9 1.9 0 0 1 1.9-1.9h1.3l1.1-1.8h7.4l1.1 1.8h1.3A1.9 1.9 0 0 1 20 8.4v8.2a1.9 1.9 0 0 1-1.9 1.9H5.9A1.9 1.9 0 0 1 4 16.6Zm8 8a3.4 3.4 0 1 0 0-6.8 3.4 3.4 0 0 0 0 6.8Z",
  mic: "M12 3.8a2.7 2.7 0 0 1 2.7 2.7v5a2.7 2.7 0 0 1-5.4 0v-5A2.7 2.7 0 0 1 12 3.8Zm-5 7.2a5 5 0 0 0 10 0M12 16.4v3.8",
  image: "M4 6.4a1.9 1.9 0 0 1 1.9-1.9h12.2A1.9 1.9 0 0 1 20 6.4v11.2a1.9 1.9 0 0 1-1.9 1.9H5.9A1.9 1.9 0 0 1 4 17.6Zm0 8.4 4-3.7 4.6 4.2 3-2.6L20 17",
  smile: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Zm-3.6-6.1a4.4 4.4 0 0 0 7.2 0M9.2 9.6v.6m5.6-.6v.6",
  clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.4V12l3.3 2",
  send: "M4 12h15m0 0-5.5-5.5M19 12l-5.5 5.5",
} as const;

function Icon({ name, size = 22 }: { name: keyof typeof iconPaths; size?: number }) {
  return (
    <svg
      className={styles.icon}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

function Dots() {
  return (
    <svg className={styles.icon} width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <circle cx="5.5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="18.5" cy="12" r="1.6" />
    </svg>
  );
}

/**
 * The one place Linkar is allowed to appear inside Instagram's UI. Styled as
 * Instagram's own centred system note - tiny, grey, unobtrusive - and set in
 * mono, which is the only thing marking it as ours. Exactly one note per screen
 * carries `active`, which is the beat that screen is about.
 */
function AutomationNote({
  children,
  detail,
  active = false,
}: {
  children: React.ReactNode;
  detail?: string;
  active?: boolean;
}) {
  return (
    <p className={styles.autoNote} data-current-action={active ? "true" : undefined}>
      <span className={styles.autoNoteLabel}>{children}</span>
      {detail ? <span className={styles.autoNoteDetail}>{detail}</span> : null}
    </p>
  );
}

/**
 * Instagram quotes the comment above a private reply, which is how the person
 * knows why a brand is suddenly in their inbox. Reproducing it keeps the thread
 * screens continuous with the comment screen instead of starting from nowhere.
 */
function QuotedComment() {
  return (
    <div className={styles.quoted}>
      <span>giovanni commented</span>
      <strong>GUIDE please</strong>
    </div>
  );
}

/**
 * The block Instagram puts at the top of a conversation: large avatar, handle,
 * follower count, and a profile link. It is the reason a real thread does not
 * open onto empty white, so leaving it out was what made these screens read as
 * mockups with a gap at the top.
 */
function ThreadIntro() {
  return (
    <div className={styles.threadIntro}>
      <span className={styles.ring} data-size="lg"><span className={styles.ringInner}>L</span></span>
      <strong>linkar.studio</strong>
      <span className={styles.threadIntroMeta}>linkar.studio<i>·</i>12.4K followers</span>
      <span className={styles.threadIntroCta}>View profile</span>
    </div>
  );
}

/** A `send_button` action as Instagram draws it: message text over a tappable row. */
function LinkCard() {
  return (
    <div className={styles.linkCard}>
      <span className={styles.linkCardMedia} aria-hidden="true" />
      <span className={styles.linkCardCopy}>
        <strong>The quick guide</strong>
        <small>linkar.studio</small>
      </span>
      <span className={styles.linkCardCta}>Open</span>
    </div>
  );
}

/**
 * Instagram's typing bubble. It only ever appears on the incoming side, because
 * Instagram never shows you your own typing - and on these screens the incoming
 * side is linkar.studio, so this is the automation composing its reply.
 */
function TypingBubble() {
  return (
    <span className={styles.typing} aria-hidden="true">
      <i /><i /><i />
    </span>
  );
}

/** Feed navigation bar: the account whose post is being commented on. */
function FeedAppBar() {
  return (
    <div className={styles.appBar}>
      <span className={styles.ring}><span className={styles.ringInner}>L</span></span>
      <span className={styles.appBarId}>
        <strong>linkar.studio</strong>
        <small>Original audio</small>
      </span>
      <Dots />
    </div>
  );
}

/**
 * Direct-message navigation bar. Instagram swaps the whole bar when you open a
 * thread - back chevron, presence line, call and video - so reusing the feed
 * bar across all four screens would break the illusion immediately.
 */
function ThreadAppBar({ presence }: { presence: string }) {
  return (
    <div className={styles.appBar} data-thread="true">
      <span className={styles.threadBack}><Icon name="back" size={20} /></span>
      <span className={styles.ring} data-size="sm"><span className={styles.ringInner}>L</span></span>
      <span className={styles.appBarId}>
        <strong>linkar.studio</strong>
        <small>{presence}</small>
      </span>
      <span className={styles.threadTools}>
        <Icon name="call" size={19} />
        <Icon name="video" size={19} />
      </span>
    </div>
  );
}

/** Instagram's comment composer. */
function CommentComposer() {
  return (
    <div className={styles.composer}>
      <span className={styles.ring} data-size="sm"><span className={styles.ringInner}>G</span></span>
      <span className={styles.composerField}>Add a comment…</span>
      <span className={styles.composerIcon}><Icon name="smile" size={19} /></span>
    </div>
  );
}

/** Instagram's message composer, in its default automated state. */
function MessageComposer({ label, cta }: { label: string; cta?: boolean }) {
  return (
    <div className={styles.composer} data-thread="true">
      <span className={styles.composerCamera}><Icon name="camera" size={17} /></span>
      <span className={styles.composerField} data-thread="true">{label}</span>
      {cta ? (
        <span className={styles.composerSend}>Send</span>
      ) : (
        <span className={styles.composerIcon} data-group="true">
          <Icon name="mic" size={18} />
          <Icon name="image" size={18} />
        </span>
      )}
    </div>
  );
}

/**
 * Screen 01 - the feed post with the comment sheet raised over it, which is
 * exactly what a person sees at the moment the trigger fires. The private reply
 * is shown as what Meta actually sends: a direct message, not a public reply
 * threaded under the comment.
 */
function CommentScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="comment">
      <FeedAppBar />
      <div className={styles.screen} data-screen="feed">
        <div className={styles.post}>
          <div className={styles.postMedia}>
            <span>REEL</span>
            <strong>Turn comments into conversations.</strong>
          </div>
          <div className={styles.postActions}>
            <span className={styles.postActionGroup}>
              <Icon name="heart" />
              <Icon name="bubble" />
              <Icon name="plane" />
            </span>
            <Icon name="bookmark" />
          </div>
          <p className={styles.postLikes}>1,284 likes</p>
          <p className={styles.postCaption}>
            <strong>linkar.studio</strong> Comment GUIDE and I’ll send the quick version.
          </p>
        </div>

        <div className={styles.sheet}>
          <span className={styles.sheetGrip} />
          <div className={styles.sheetBar}>
            <strong>Comments</strong>
            <Icon name="plane" size={19} />
          </div>

          <div className={styles.commentRow}>
            <span className={styles.ring} data-size="sm" data-plain="true"><span className={styles.ringInner}>G</span></span>
            <span className={styles.commentCopy}>
              <span><strong>giovanni</strong> GUIDE please</span>
              <span className={styles.commentMeta}>2m<i>·</i>1 like<i>·</i>Reply</span>
            </span>
            <span className={styles.commentHeart}><Icon name="heart" size={14} /></span>
          </div>

          <AutomationNote detail="Private reply sent" active>Keyword matched</AutomationNote>

          <div className={styles.inboxRow}>
            <span className={styles.ring} data-size="sm"><span className={styles.ringInner}>L</span></span>
            <span className={styles.inboxCopy}>
              <strong>linkar.studio</strong>
              <span>The quick guide is ready. What would you like to improve first?</span>
            </span>
            <span className={styles.unread} />
          </div>
        </div>
      </div>
      <CommentComposer />
    </div>
  );
}

/**
 * Screen 02 - the same conversation, now open as a thread. The question is a
 * real Instagram quick-reply set, because `quick_replies` is what the runner
 * sends: tappable chips, then the tapped one echoed back as the person's own
 * message.
 */
function QualifyScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="qualify">
      <ThreadAppBar presence="Active now" />
      <div className={styles.screen} data-screen="thread">
        <ThreadIntro />
        <p className={styles.dayMark}>Today</p>
        <QuotedComment />
        <p className={styles.bubbleIn}>The quick guide is ready. What would you like to improve first?</p>
        <LinkCard />
        <TypingBubble />
        <p className={styles.bubbleIn}>More replies or better leads?</p>
        {/* Chips stay untapped: the echoed message below is what names the
            answer, exactly as Instagram resolves a quick reply. */}
        <div className={styles.chips}>
          <span>More replies</span>
          <span>Better leads</span>
        </div>
        <p className={styles.bubbleOut}>Better leads</p>
        <AutomationNote detail="Goal saved" active>Answer stored</AutomationNote>
      </div>
      <MessageComposer label="Message…" />
    </div>
  );
}

/**
 * Screen 03 - the same thread a beat later. The follow-up is drawn as a pending
 * outgoing message rather than a sent one, because it has not been sent yet, and
 * the note names the real constraint it lives inside: Meta's 24-hour window.
 */
function FollowupScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="followup">
      <ThreadAppBar presence="Active 18h ago" />
      <div className={styles.screen} data-screen="thread">
        <ThreadIntro />
        <p className={styles.bubbleIn}>The quick guide is ready. What would you like to improve first?</p>
        <LinkCard />
        <p className={styles.bubbleIn}>More replies or better leads?</p>
        <p className={styles.bubbleOut}>Better leads</p>
        <AutomationNote detail="Goal saved">Answer stored</AutomationNote>
        <AutomationNote detail="Within window" active>Queued for + 18h</AutomationNote>
        <p className={styles.bubblePending}>
          How is the guide fitting the way you qualify new leads?
          <span className={styles.pendingTag}><Icon name="clock" size={12} /> Not sent yet</span>
        </p>
      </div>
      <MessageComposer label="Message…" />
    </div>
  );
}

/**
 * Screen 04 - the handoff. The automation stops, the presence line changes to
 * name the human, and the composer becomes theirs. Nothing about the surface
 * changes; only who is holding it.
 */
function HandoffScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="handoff">
      <ThreadAppBar presence="You’re replying" />
      <div className={styles.screen} data-screen="thread">
        <ThreadIntro />
        <p className={styles.bubbleOut}>Better leads</p>
        <AutomationNote detail="Goal saved">Answer stored</AutomationNote>
        <p className={styles.dayMark}>Yesterday<i>·</i>9:41</p>
        <p className={styles.bubbleOut}>How is the guide fitting the way you qualify new leads?</p>
        <TypingBubble />
        <p className={styles.bubbleIn}>Project details received</p>
        <AutomationNote detail="Automation paused" active>Handed to you</AutomationNote>
        {/* Deliberately not dressed as Instagram: the queue is Linkar's own
            surface, so it is set in Linkar's mono and carries the volt edge
            rather than pretending to be a message. */}
        <div className={styles.queue}>
          <span className={styles.queueFlag}>Ready for you</span>
          <strong>Full context attached</strong>
          <span className={styles.queueMeta}>Goal: better leads<i>·</i>Guide sent<i>·</i>4 messages</span>
        </div>
      </div>
      <MessageComposer label="Reply as linkar.studio" cta />
    </div>
  );
}

function SceneBody({ scene }: { scene: StoryChapter["scene"] }) {
  return (
    <>
      {scene === "comment" ? <CommentScene /> : null}
      {scene === "qualify" ? <QualifyScene /> : null}
      {scene === "followup" ? <FollowupScene /> : null}
      {scene === "handoff" ? <HandoffScene /> : null}
    </>
  );
}

/**
 * iOS status bar only. The app's own navigation bar belongs to each screen, not
 * to the device, so it moved into the scenes - which is also why crossfading
 * between them reads as navigating rather than as swapping a diagram.
 */
function FrameBar() {
  return (
    <div className={styles.phoneChrome}>
      <div className={styles.phoneStatusBar}>
        <span>9:41</span>
        <span className={styles.dynamicIsland} />
        <span className={styles.phoneSignals}>
          <span className={styles.cellularSignal} aria-hidden="true"><i /><i /><i /><i /></span>
          <span className={styles.wifiSignal} aria-hidden="true" />
          <b>87%</b>
          <span className={styles.battery} aria-hidden="true"><i /></span>
        </span>
      </div>
    </div>
  );
}

function MobileScene({ scene }: { scene: StoryChapter["scene"] }) {
  return (
    <Reveal
      as="div"
      className={`${styles.sceneFrame} ${styles.mobileScene}`}
      data-flow-scene={scene}
      data-scene-frame
      data-device-frame="iphone"
      data-social-interface="true"
      aria-hidden="true"
    >
      <FrameBar />
      <SceneBody scene={scene} />
      <span className={styles.homeIndicator} />
    </Reveal>
  );
}

export function AutomationStory({ chapters = storyChapters }: AutomationStoryProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [motion, setMotion] = useState<"full" | "reduced">("full");
  const sectionRef = useRef<HTMLElement | null>(null);
  const storyBodyRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId: number | null = null;
    let tracking = false;

    const updateProgress = () => {
      const section = sectionRef.current;
      const storyBody = storyBodyRef.current;
      if (!section || !storyBody) return;

      const bounds = storyBody.getBoundingClientRect();
      const activationLine = window.innerHeight * 0.45;
      const rawProgress = bounds.height > 0 ? (activationLine - bounds.top) / bounds.height : 0;
      const progress = Math.min(Math.max(rawProgress, 0), 1);
      const nextIndex = progress >= 0.75 ? 3 : progress >= 0.5 ? 2 : progress >= 0.25 ? 1 : 0;

      section.style.setProperty("--story-progress", String(progress));
      section.style.setProperty("--story-index", String(nextIndex));
      setActiveIndex((current) => current === nextIndex ? current : nextIndex);
    };

    const scheduleProgress = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(() => {
        frameId = null;
        updateProgress();
      });
    };

    const stopTracking = () => {
      if (tracking) {
        window.removeEventListener("scroll", scheduleProgress);
        window.removeEventListener("resize", scheduleProgress);
        tracking = false;
      }
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    const syncTracking = () => {
      stopTracking();
      const reduced = motionQuery.matches;
      setMotion(reduced ? "reduced" : "full");

      if (reduced || !desktopQuery.matches) {
        sectionRef.current?.style.setProperty("--story-progress", "0");
        sectionRef.current?.style.setProperty("--story-index", "0");
        setActiveIndex(0);
        return;
      }

      window.addEventListener("scroll", scheduleProgress, { passive: true });
      window.addEventListener("resize", scheduleProgress, { passive: true });
      tracking = true;
      scheduleProgress();
    };

    desktopQuery.addEventListener("change", syncTracking);
    motionQuery.addEventListener("change", syncTracking);
    syncTracking();

    return () => {
      stopTracking();
      desktopQuery.removeEventListener("change", syncTracking);
      motionQuery.removeEventListener("change", syncTracking);
    };
  }, [chapters.length]);

  const safeActiveIndex = Math.min(activeIndex, Math.max(chapters.length - 1, 0));
  const activeScene = chapters[safeActiveIndex]?.scene ?? "comment";

  return (
    <section
      id="how-it-works"
      className={styles.section}
      aria-labelledby="story-title"
      data-active-scene={activeScene}
      data-active-index={safeActiveIndex}
      data-motion={motion}
      ref={sectionRef}
      style={{ "--story-progress": 0, "--story-index": safeActiveIndex } as React.CSSProperties}
    >
      <header className={styles.header}>
        <h2 id="story-title">One spark. A conversation that knows what comes next.</h2>
        <p>Linkar turns a simple trigger into a clear, useful sequence.</p>
      </header>

      <div className={styles.storyGrid} data-story-body ref={storyBodyRef}>
        <div className={styles.copyRail}>
          {chapters.map((chapter, index) => (
            <article
              key={chapter.id}
              id={`story-${chapter.id}`}
              className={styles.chapter}
              aria-labelledby={`story-${chapter.id}-title`}
              data-chapter={chapter.scene}
              data-chapter-index={index}
              data-active={safeActiveIndex === index ? "true" : "false"}
            >
              <p className={styles.sequence} data-sequence>{chapter.eyebrow}</p>
              <h3 id={`story-${chapter.id}-title`}>{chapter.title}</h3>
              <p className={styles.chapterBody} data-chapter-copy>{chapter.body}</p>
              <MobileScene scene={chapter.scene} />
            </article>
          ))}
        </div>

        <div className={styles.stage} data-desktop-stage>
          <figure aria-label="Linkar automation preview in an iPhone social conversation interface">
            <ol className={styles.semanticSummary}>
              {chapters.map((chapter) => (
                <li key={chapter.id}>
                  <strong>{chapter.title}.</strong>{" "}
                  {sceneSummaries[chapter.scene].join("; ")}.
                </li>
              ))}
            </ol>
            <div className={styles.controlRoom} aria-hidden="true">
              <div
                className={styles.sceneFrame}
                data-scene-frame
                data-device-frame="iphone"
                data-social-interface="true"
              >
                <FrameBar />
                <div className={styles.sceneLayers}>
                  {chapters.map((chapter, index) => (
                    <div
                      key={chapter.id}
                      className={styles.desktopScene}
                      data-scene={chapter.scene}
                      data-active={safeActiveIndex === index ? "true" : "false"}
                    >
                      <SceneBody scene={chapter.scene} />
                    </div>
                  ))}
                </div>
                <span className={styles.homeIndicator} />
              </div>
            </div>
            <figcaption className={styles.figcaption}>Linkar conversation flow.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
