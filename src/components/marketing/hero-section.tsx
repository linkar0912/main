import Image from "next/image";
import { ButtonRoll } from "./button-roll";
import { InstagramGlyph } from "../instagram-glyph";
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
 * The row of marks along the bottom of the hero. Every mark is literally
 * true for Linkar: Meta App Review approval, the official Instagram API,
 * real usage, and Razorpay payments. No partner programme logos or ratings
 * Linkar has not earned (Meta's logo and badges belong to Meta's programmes).
 * Update the reply count from production as it grows; keep it a lower bound.
 */
function HeroTrustStrip() {
  return (
    <ul className={styles.trustStrip} aria-label="Why people trust Linkar">
      <li className={styles.trustItem}>
        <svg className={styles.trustIcon} viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" focusable="false">
          <path d="M12 2.5 4.5 5.4v5.9c0 4.6 3.1 8.7 7.5 10.2 4.4-1.5 7.5-5.6 7.5-10.2V5.4L12 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
          <path d="m8.6 12.1 2.3 2.3 4.6-4.8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className={styles.trustText}><strong>Approved by Meta</strong><span>App Review</span></span>
      </li>
      <li className={styles.trustItem}>
        <span className={styles.trustIcon}><InstagramGlyph size={28} /></span>
        <span className={styles.trustText}><strong>Official</strong><span>Instagram API</span></span>
      </li>
      <li className={styles.trustItem}>
        <span className={styles.trustFigure}>14,000+</span>
        <span className={styles.trustText}><strong>Replies</strong><span>sent so far</span></span>
      </li>
      <li className={styles.trustItem}>
        <svg className={styles.trustIcon} viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
          <rect x="5" y="10.5" width="14" height="10" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <span className={styles.trustText}><strong>Secure payments</strong><span>by Razorpay</span></span>
      </li>
    </ul>
  );
}
