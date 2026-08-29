"use client";

import { useEffect, useRef, useState } from "react";
import { surfaceCards } from "./marketing-content";
import { Reveal } from "./reveal";
import styles from "./surface-runway.module.css";

type RunwayMode = "desktop" | "flow" | "reduced";

function getRunwayMode(desktop: boolean, reducedMotion: boolean): RunwayMode {
  if (reducedMotion) return "reduced";
  return desktop ? "desktop" : "flow";
}

function Preview({ steps }: { steps: readonly [string, string, string] }) {
  return (
    <Reveal
      as="figure"
      className={styles.preview}
      aria-label={`${steps.join(" to ")} preview`}
      data-reduced-motion-state="visible"
    >
      <div className={styles.previewSteps} aria-hidden="true">
        {steps.map((step, index) => (
          <div className={styles.previewStep} key={step} data-step={index}>
            <span className={styles.previewNode} />
            <span>{step}</span>
          </div>
        ))}
      </div>
      <svg className={styles.connector} viewBox="0 0 440 116" fill="none" aria-hidden="true">
        <path d="M50 24C112 24 110 58 184 58H256C330 58 328 92 390 92" />
        <circle cx="50" cy="24" r="7" />
        <circle cx="220" cy="58" r="7" />
        <circle cx="390" cy="92" r="7" />
      </svg>
      <figcaption>{steps.join(" → ")}</figcaption>
    </Reveal>
  );
}

export function SurfaceRunway() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const trackRef = useRef<HTMLUListElement | null>(null);
  const [mode, setMode] = useState<RunwayMode>("flow");

  useEffect(() => {
    const desktopQuery = window.matchMedia("(min-width: 1024px)");
    const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frameId: number | null = null;

    const updateProgress = () => {
      frameId = null;
      const section = sectionRef.current;
      const viewport = viewportRef.current;
      const track = trackRef.current;
      if (!section || !viewport || !track) return;

      const rect = section.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const scrollableDistance = Math.max(rect.height - viewportHeight, 1);
      const progress = Math.min(Math.max(-rect.top / scrollableDistance, 0), 1);
      const travel = Math.max(track.scrollWidth - viewport.clientWidth, 0);
      section.style.setProperty("--runway-progress", String(progress));
      section.style.setProperty("--runway-travel", `${-travel}px`);
    };

    const scheduleProgress = () => {
      if (frameId !== null) return;
      frameId = window.requestAnimationFrame(updateProgress);
    };

    const configure = () => {
      const nextMode = getRunwayMode(desktopQuery.matches, motionQuery.matches);
      setMode(nextMode);
      if (nextMode === "desktop") {
        window.addEventListener("scroll", scheduleProgress, { passive: true });
        window.addEventListener("resize", scheduleProgress, { passive: true });
        scheduleProgress();
      }
    };

    const unconfigure = () => {
      window.removeEventListener("scroll", scheduleProgress);
      window.removeEventListener("resize", scheduleProgress);
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
        frameId = null;
      }
    };

    const onMediaChange = () => {
      unconfigure();
      configure();
    };

    configure();
    desktopQuery.addEventListener("change", onMediaChange);
    motionQuery.addEventListener("change", onMediaChange);

    return () => {
      unconfigure();
      desktopQuery.removeEventListener("change", onMediaChange);
      motionQuery.removeEventListener("change", onMediaChange);
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      id="surfaces"
      className={styles.section}
      aria-labelledby="surfaces-title"
      data-runway-mode={mode}
      data-reduced-motion-state={mode === "reduced" ? "static" : undefined}
    >
      <header className={styles.header}>
        <h2 id="surfaces-title">Meet people where the conversation starts.</h2>
        <p>Choose the signal. Linkar gives every response a deliberate next step.</p>
      </header>
      <div ref={viewportRef} className={styles.viewport} data-runway-viewport>
        <ul ref={trackRef} className={styles.track} data-runway-track>
          {surfaceCards.map((card) => (
            <li key={card.id}>
              <article className={styles.card} aria-labelledby={`${card.id}-title`}>
                <span className={styles.cardNumber}>{String(surfaceCards.indexOf(card) + 1).padStart(2, "0")}</span>
                <h3 id={`${card.id}-title`}>{card.title}</h3>
                <p className={styles.cardBody}>{card.body}</p>
                <Preview steps={card.preview} />
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
