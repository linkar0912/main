"use client";

import { useEffect, useState } from "react";

import styles from "./pricing-page.module.css";

/** Floating shortcut to the plan finder, hidden while the finder is on screen. */
export function PricingJump({ targetId }: { targetId: string }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(!entry.isIntersecting),
      { rootMargin: "-20% 0px -20% 0px" },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return (
    <a className={styles.jump} href={`#${targetId}`} data-visible={visible || undefined}>
      Pick your plan in 30 seconds
      <span aria-hidden="true">&#8593;</span>
    </a>
  );
}
