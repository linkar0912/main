"use client";

import { useEffect, useRef, useState } from "react";
import { storyChapters, type StoryChapter } from "./marketing-content";
import styles from "./automation-story.module.css";

type AutomationStoryProps = {
  chapters?: readonly StoryChapter[];
};

const sceneSummaries = {
  comment: [
    'Comment “GUIDE please”',
    'Condition “Keyword matched”',
    'Reply “The quick guide is ready. What would you like to improve first?”',
  ],
  qualify: [
    'Question “More replies or better leads?”',
    'Answer “Better leads”',
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

function Connector({ direction = "down" }: { direction?: "down" | "across" }) {
  const across = direction === "across";

  return (
    <svg
      className={across ? styles.connectorAcross : styles.connector}
      viewBox={across ? "0 0 90 28" : "0 0 28 54"}
      aria-hidden="true"
      focusable="false"
    >
      <path d={across ? "M2 14H78" : "M14 2V42"} />
      <path d={across ? "m72 7 8 7-8 7" : "m7 36 7 8 7-8"} />
    </svg>
  );
}

function Status({ children, active = false }: { children: React.ReactNode; active?: boolean }) {
  return (
    <span className={styles.status} data-current-action={active ? "true" : undefined}>
      <span className={styles.statusDot} />
      {children}
    </span>
  );
}

function CommentScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="comment">
      <div className={styles.socialPost}>
        <div className={styles.socialPostVisual}>
          <span>LINKAR</span>
          <strong>Turn comments into conversations.</strong>
        </div>
        <div className={styles.socialActions} aria-hidden="true">
          <span>♡</span><span>○</span><span>⌁</span><span>☆</span>
        </div>
        <p><strong>linkar.studio</strong> Comment GUIDE and I’ll send the quick version.</p>
      </div>
      <div className={styles.commentsSheet}>
        <div className={styles.commentsTitle}>
          <span aria-hidden="true">‹</span>
          <strong>Comments</strong>
          <span aria-hidden="true">⌁</span>
        </div>
        <div className={styles.commentRow}>
          <span className={styles.avatar}>G</span>
          <div className={styles.commentCopy}>
            <p><strong>giovanni</strong> GUIDE please</p>
            <span>2m · Reply</span>
          </div>
          <span className={styles.commentHeart} aria-hidden="true">♡</span>
        </div>
        <div className={styles.automationNotice}>
          <Status active>Keyword matched</Status>
          <span>Private reply sent</span>
        </div>
        <div className={styles.dmPreview}>
          <div className={styles.dmIdentity}>
            <span className={styles.dmAvatar}>L</span>
            <span><strong>linkar.studio</strong><small>sent you a message</small></span>
          </div>
          <p>The quick guide is ready. What would you like to improve first?</p>
        </div>
        <div className={styles.addComment}>
          <span aria-hidden="true">☺</span>
          <span>Add a comment…</span>
          <span aria-hidden="true">♡</span>
        </div>
      </div>
    </div>
  );
}

function QualifyScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="qualify">
      <div className={styles.sceneTopline}>
        <span>Focused question</span>
        <Status>Waiting for answer</Status>
      </div>
      <div className={`${styles.card} ${styles.questionCard}`}>
        <span className={styles.cardLabel}>Question</span>
        <p>More replies or better leads?</p>
        <span className={styles.answerChip}>Better leads</span>
      </div>
      <Connector />
      <div className={`${styles.card} ${styles.memoryCard}`}>
        <span className={styles.cardLabel}>Stored goal</span>
        <div className={styles.savedField}>
          <span>Goal</span>
          <strong>Better leads</strong>
          <Status active>Goal saved</Status>
        </div>
      </div>
    </div>
  );
}

function FollowupScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="followup">
      <div className={styles.sceneTopline}>
        <span>Thoughtful follow-up</span>
        <Status>Within window</Status>
      </div>
      <div className={`${styles.card} ${styles.timelineCard}`}>
        <span className={styles.cardLabel}>Timeline</span>
        <div className={styles.timelineEvent}>
          <span className={styles.timelineDot} />
          <div><strong>Now</strong><p>guide sent</p></div>
        </div>
        <div className={styles.timelineLine} />
        <div className={styles.timelineEvent} data-current="true" data-current-action="true">
          <span className={styles.timelineDot} />
          <div><strong>+ 18h</strong><p>check in</p></div>
        </div>
      </div>
      <div className={`${styles.card} ${styles.checkinCard}`}>
        <span className={styles.cardLabel}>Scheduled message</span>
        <p>How is the guide fitting the way you qualify new leads?</p>
      </div>
    </div>
  );
}

function HandoffScene() {
  return (
    <div className={styles.sceneBody} data-scene-body="handoff">
      <div className={styles.sceneTopline}>
        <span>Human handoff</span>
        <Status active>Automation paused</Status>
      </div>
      <div className={`${styles.card} ${styles.signalCard}`}>
        <span className={styles.cardLabel}>Signal</span>
        <p>Project details received</p>
      </div>
      <Connector direction="across" />
      <div className={`${styles.card} ${styles.queueCard}`}>
        <span className={styles.queueFlag}>Ready for you</span>
        <span className={styles.cardLabel}>Conversation queue</span>
        <strong>Full context attached</strong>
        <div className={styles.contextLines}><span /><span /><span /></div>
      </div>
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
      <div className={styles.socialHeader}>
        <span className={styles.socialAvatar}>L</span>
        <span className={styles.socialIdentity}>
          <strong>linkar.studio</strong>
          <small>Professional dashboard</small>
        </span>
        <span className={styles.socialMenu} aria-hidden="true">•••</span>
      </div>
    </div>
  );
}

function MobileScene({ scene }: { scene: StoryChapter["scene"] }) {
  return (
    <div
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
    </div>
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
