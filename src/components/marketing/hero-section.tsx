import Image from "next/image";
import { BILLING_PLANS } from "@/src/lib/billing/catalog";
import { ButtonRoll } from "./button-roll";
import styles from "./hero-section.module.css";

export function HeroSection() {
  return (
    <section id="top" className={styles.hero} aria-labelledby="hero-title" data-motion="staged">
      <div className={styles.imageFrame} aria-hidden="true">
        <Image
          className={styles.image}
          src="/marketing/linkar-hero-indian-relaxed.webp"
          alt="A creator relaxing at his desk while Linkar answers his Instagram comments and DMs"
          fill
          priority
          sizes="100vw"
        />
      </div>
      <div className={styles.scrim} aria-hidden="true" />

      <div className={styles.grid}>
        <div className={styles.copy}>
          <h1 id="hero-title" className={styles.title}>
            {/* The searchable name of the product, set small above the display lines. */}
            <span className={styles.titleKicker}>Instagram comment and DM automation </span>
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
          <p className={styles.proof}>Free to start. Paid plans from ₹{BILLING_PLANS.creator.monthlyPaise / 100} a month.</p>
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
      <HeroTrustStrip />
    </section>
  );
}

/**
 * The row of lockups along the bottom of the hero, sized like ManyChat's
 * partner row. All three share one shape: an icon and two short lines in
 * the site's sans face. Every claim is literally true for Linkar (Meta
 * business verification, the official Instagram API, real usage). No
 * partner-programme badges or ratings Linkar has not earned.
 * Keep the reply count a lower bound of the production figure.
 */
function HeroTrustStrip() {
  return (
    <ul className={styles.trustStrip} aria-label="Why people trust Linkar">
      <li>
        {/* Meta's mark, at the owner's request (decided 13 Oct 2026 with the
            brand-policy risk explained); the words stay literally true. */}
        <svg className={styles.lockupIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false" data-mark="meta">
          <path fill="currentColor" d="M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z" />
        </svg>
        <span className={styles.lockupText}><span>Meta Verified</span><span>Business</span></span>
      </li>
      <li>
        <svg className={styles.lockupIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" />
          <circle cx="12" cy="12" r="4.6" fill="none" stroke="#1d1410" strokeWidth="2" />
          <circle cx="17.4" cy="6.6" r="1.35" fill="#1d1410" />
        </svg>
        <span className={styles.lockupText}><span>Official</span><span>Instagram API</span></span>
      </li>
      <li>
        <svg className={styles.lockupIcon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 2.5c5.5 0 9.5 3.9 9.5 8.7 0 4.8-4 8.7-9.5 8.7-1.1 0-2.1-.1-3.1-.4L4 21.5l1.3-4.2C3.5 15.8 2.5 13.6 2.5 11.2 2.5 6.4 6.5 2.5 12 2.5Z" fill="currentColor" />
          <path d="M8 11.4h.01M12 11.4h.01M16 11.4h.01" stroke="#1d1410" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        <span className={styles.lockupText}><span>14K+ replies</span><span>sent so far</span></span>
      </li>
    </ul>
  );
}
