import Image from "next/image";
import { ButtonRoll } from "./button-roll";
import styles from "./hero-section.module.css";

const flowStates = [
  {
    label: "Incoming message",
    text: "Can you send the guide?",
  },
  {
    label: "Rule matched",
    text: "Keyword found: GUIDE",
  },
  {
    label: "Reply sent",
    text: "Absolutely, I’ve sent the quick version. What are you hoping to improve first?",
  },
] as const;

export function HeroSection() {
  return (
    <section id="top" className={styles.hero} aria-labelledby="hero-title" data-motion="staged">
      <div className={styles.imageFrame} aria-hidden="true">
        <Image
          className={styles.image}
          src="/marketing/linkar-hero.webp"
          alt=""
          fill
          priority
          sizes="100vw"
        />
      </div>
      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.grid}>
        <div className={styles.copy}>
          <h1 id="hero-title" className={styles.title}>
            <span className={styles.titleLine}>Turn attention into </span>
            <span className={styles.titleLine}>conversations that keep moving.</span>
          </h1>
          <p className={styles.body}>
            Set the trigger once. Linkar replies with context, follows up on time, and brings you back when a real person matters.
          </p>
          <div className={styles.actions} data-action-visibility="persistent" data-motion-reduced="final">
            <a
              className={styles.primaryAction}
              href="/signup"
              data-motion-stage="action"
              data-roll-primary="native"
              data-roll-secondary="entering"
            >
              <ButtonRoll label="Start building" />
            </a>
          </div>
          <p className={styles.proof}>Clear rules. Useful replies. Your voice.</p>
        </div>

        <figure className={styles.scene} aria-label="A Linkar reply flow in motion">
          <ol className={styles.flow}>
            {flowStates.map((state, index) => (
              <li key={state.label} className={styles.flowState} data-state={index + 1}>
                <span className={styles.flowLabel}>{state.label}</span>
                <p>{state.text}</p>
              </li>
            ))}
          </ol>
          <figcaption className={styles.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            Conversation moving
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
