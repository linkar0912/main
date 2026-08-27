"use client";

import {
  useEffect,
  useRef,
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type ElementType,
} from "react";
import styles from "./primitives.module.css";

type RevealTag = Extract<keyof React.JSX.IntrinsicElements, keyof HTMLElementTagNameMap>;

type RevealProps<Tag extends RevealTag = "div"> = {
  as?: Tag;
  delay?: number;
} & Omit<ComponentPropsWithoutRef<Tag>, "as">;

type RevealStyle = CSSProperties & {
  "--reveal-delay"?: string;
};

export function Reveal<Tag extends RevealTag = "div">({
  as,
  children,
  className,
  delay,
  style,
  ...attributes
}: RevealProps<Tag>) {
  const revealRef = useRef<HTMLElement>(null);

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

  const revealStyle: RevealStyle | undefined = delay === undefined
    ? style
    : { ...style, "--reveal-delay": `${delay}ms` };
  const Component = (as ?? "div") as ElementType;

  return (
    <Component
      {...attributes}
      ref={revealRef}
      className={[styles.reveal, className].filter(Boolean).join(" ")}
      data-reveal=""
      style={revealStyle}
    >
      {children}
    </Component>
  );
}
