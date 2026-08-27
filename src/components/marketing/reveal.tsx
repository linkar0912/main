"use client";

import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import styles from "./primitives.module.css";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: number;
};

type RevealStyle = CSSProperties & {
  "--reveal-delay"?: string;
};

export function Reveal({ children, className, delay }: RevealProps) {
  const revealRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = revealRef.current;

    if (!element || typeof IntersectionObserver === "undefined") {
      return;
    }

    element.dataset.enhanced = "true";

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }

          (entry.target as HTMLElement).dataset.visible = "true";
          observer.unobserve(entry.target);
        }
      },
      {
        threshold: 0.18,
        rootMargin: "0px 0px -10% 0px",
      },
    );

    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  const revealStyle: RevealStyle | undefined =
    delay === undefined ? undefined : { "--reveal-delay": `${delay}ms` };

  return (
    <div
      ref={revealRef}
      className={[styles.reveal, className].filter(Boolean).join(" ")}
      data-reveal=""
      style={revealStyle}
    >
      {children}
    </div>
  );
}
