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
          <HeroTrustStrip />
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

/**
 * The row of lockups along the bottom of the hero, styled like ManyChat's
 * partner row: a two-line wordmark, an icon with three stacked caps lines,
 * and an icon with a mono figure. Every claim is literally true for Linkar
 * (Meta App Review approval, the official Instagram API, real usage) - no
 * partner-programme logos, Meta's own marks or ratings Linkar has not earned.
 * Keep the reply count a lower bound of the production figure.
 */
function HeroTrustStrip() {
  return (
    <ul className={styles.trustStrip} aria-label="Why people trust Linkar">
      <li className={styles.lockupWordmark}>
        <span className={styles.wordmarkTop}>
          <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M12 2 4 5.1v6.2c0 4.9 3.3 9.2 8 10.7 4.7-1.5 8-5.8 8-10.7V5.1L12 2Z" fill="currentColor" />
            <path d="m8.4 12.1 2.4 2.4 4.8-5" fill="none" stroke="#1d1410" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Meta App Review
        </span>
        <span className={styles.wordmarkBottom}>Approved</span>
      </li>
      <li className={styles.lockupStacked}>
        <svg className={styles.lockupIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
          <circle cx="12" cy="12" r="4.6" fill="none" stroke="#1d1410" strokeWidth="2" />
          <circle cx="17.4" cy="6.6" r="1.35" fill="#1d1410" />
        </svg>
        <span className={styles.stackedText}><span>Official</span><span>Instagram</span><span>API</span></span>
      </li>
      <li className={styles.lockupFigure}>
        <svg className={styles.lockupIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2.5c5.5 0 9.5 3.9 9.5 8.7 0 4.8-4 8.7-9.5 8.7-1.1 0-2.1-.1-3.1-.4L4 21.5l1.3-4.2C3.5 15.8 2.5 13.6 2.5 11.2 2.5 6.4 6.5 2.5 12 2.5Z" fill="currentColor" />
          <path d="M8 11.4h.01M12 11.4h.01M16 11.4h.01" stroke="#1d1410" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className={styles.figureText}><strong>14K+</strong><span>Replies sent</span></span>
      </li>
    </ul>
  );
}
