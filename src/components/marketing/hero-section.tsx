import Image from "next/image";
import { ButtonRoll } from "./button-roll";
import styles from "./hero-section.module.css";

export function HeroSection() {
  return (
    <section id="top" className={styles.hero} aria-labelledby="hero-title" data-motion="staged">
      <div className={styles.imageFrame} aria-hidden="true">
        <Image
          className={styles.image}
          src="/marketing/linkar-hero-indian-relaxed.webp"
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
            <span className={styles.titleLine}>Reply to every opportunity. </span>
            <span className={styles.titleLine}>Even when you are away.</span>
          </h1>
          <p className={styles.body}>
            Choose what someone says or does, write the reply once, and let Linkar answer comments and messages for you.
          </p>
          <div className={styles.actions} data-action-visibility="persistent" data-motion-reduced="final">
            <a
              className={styles.primaryAction}
              href="/signup"
              data-motion-stage="action"
              data-roll-primary="native"
              data-roll-secondary="entering"
              data-contrast="white-on-magenta"
            >
              <ButtonRoll label="Create your first reply" />
            </a>
          </div>
          <p className={styles.proof}>Easy to set up. Always in your voice.</p>
        </div>

        <figure
          className={styles.scene}
          aria-label="A Linkar conversation preview"
          data-brand-palette="linkar"
          data-conversation-motion="looping"
          data-message-visibility="stacking-feed"
          data-loop-continuity="seamless"
        >
          <div className={styles.messageStack} data-conversation-feed="bottom-anchored">
            <div className={styles.messageSlot} data-message-stage="1">
              <div className={styles.messageSlotInner}>
                <div className={`${styles.messageRow} ${styles.messageRowIncoming}`}>
                  <span className={styles.messageAvatar} aria-hidden="true">A</span>
                  <div className={`${styles.messageBubble} ${styles.messageBubbleIncoming}`}>
                    <p>Do you have a website where I can see more?</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.messageSlot} data-message-typing="linkar" aria-hidden="true">
              <div className={styles.messageSlotInner}>
                <div className={`${styles.messageRow} ${styles.messageRowOutgoing}`}>
                  <span className={styles.typing}>
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                    <span className={styles.typingDot} />
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.messageSlot} data-message-stage="2">
              <div className={styles.messageSlotInner}>
                <div className={`${styles.messageRow} ${styles.messageRowOutgoing}`}>
                  <div className={`${styles.messageBubble} ${styles.messageBubbleFollowup}`}>
                    <p>Absolutely, here’s our website. Want to see pricing too?</p>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.messageSlot} data-message-stage="3">
              <div className={styles.messageSlotInner}>
                <div className={`${styles.messageRow} ${styles.messageRowIncoming}`}>
                  <span className={styles.messageAvatar} aria-hidden="true">A</span>
                  <div className={`${styles.messageBubble} ${styles.messageBubbleIncoming}`}>
                    <p>Can I try it before I publish anything?</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <figcaption className={styles.status}>
            <span className={styles.statusDot} aria-hidden="true" />
            Conversation moving
          </figcaption>
        </figure>
      </div>
    </section>
  );
}
