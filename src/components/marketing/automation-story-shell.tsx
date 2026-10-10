"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { StoryChapter } from "./marketing-content";
import styles from "./automation-story.module.css";

type AutomationStoryShellProps = {
  chapters: readonly StoryChapter[];
  /** Screen-reader summary for each chapter's phone, in chapter order. */
  sceneSummaries: readonly string[];
  /** Server-rendered phone screens, one per chapter, for the desktop stage. */
  desktopScenes: readonly ReactNode[];
  /** Server-rendered phone frames, one per chapter, shown inline below tablet width. */
  mobileScenes: readonly ReactNode[];
  frameBar: ReactNode;
};

/**
 * The interactive part of the automation story: scroll tracking that picks the
 * active chapter on desktop. Everything it shows is passed in already rendered
 * by the server component in automation-story.tsx.
 */
export function AutomationStoryShell({ chapters, sceneSummaries, desktopScenes, mobileScenes, frameBar }: AutomationStoryShellProps) {
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
        <h2 id="story-title">From the first comment to the right next step.</h2>
        <p>Linkar replies, remembers useful answers, follows up, and brings in your team when needed.</p>
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
              data-chapter-state={index < safeActiveIndex ? "before" : index > safeActiveIndex ? "after" : "active"}
            >
              <div className={styles.storyProgressRail} data-story-progress-rail aria-hidden="true">
                {chapters.map((progressChapter, progressIndex) => {
                  const progressState = progressIndex < safeActiveIndex ? "before" : progressIndex > safeActiveIndex ? "after" : "active";
                  return (
                    <span
                      key={progressChapter.id}
                      className={styles.storyProgressMark}
                      data-progress-mark
                      data-progress-state={progressState}
                      data-progress-step={progressState === "before" ? "complete" : progressState === "after" ? "upcoming" : "active"}
                    />
                  );
                })}
              </div>
              <h3 id={`story-${chapter.id}-title`}>{chapter.title}</h3>
              <p className={styles.chapterBody} data-chapter-copy>{chapter.body}</p>
              {mobileScenes[index]}
            </article>
          ))}
          <Link className={styles.storyCta} href="/signup">Get started</Link>
        </div>

        <div className={styles.stage} data-desktop-stage>
          <figure aria-label="Linkar reply preview in an iPhone conversation">
            <ol className={styles.semanticSummary}>
              {chapters.map((chapter, index) => (
                <li key={chapter.id}>
                  <strong>{chapter.title}.</strong>{" "}
                  {sceneSummaries[index]}.
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
                {frameBar}
                <div className={styles.sceneLayers}>
                  {chapters.map((chapter, index) => (
                    <div
                      key={chapter.id}
                      className={styles.desktopScene}
                      data-scene={chapter.scene}
                      data-active={safeActiveIndex === index ? "true" : "false"}
                      data-scene-state={index < safeActiveIndex ? "before" : index > safeActiveIndex ? "after" : "active"}
                    >
                      {desktopScenes[index]}
                    </div>
                  ))}
                </div>
                <span className={styles.homeIndicator} />
              </div>
            </div>
            <figcaption className={styles.figcaption}>A conversation handled by Linkar.</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
