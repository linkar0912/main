import { InstagramGlyph } from "../instagram-glyph";
import { Reveal } from "./reveal";
import styles from "./setup-steps.module.css";

type SetupStep = {
  id: "connect" | "trigger" | "publish";
  number: string;
  title: string;
  description: string;
  status: string;
};

const setupSteps: readonly SetupStep[] = [
  {
    id: "connect",
    number: "01",
    title: "Connect Instagram or Facebook",
    description: "Choose the professional Instagram account or Facebook Page that Linkar should reply from.",
    status: "Connected securely",
  },
  {
    id: "trigger",
    number: "02",
    title: "Choose what starts the reply",
    description: "Pick a comment, message, or Story mention, then choose the words Linkar should look for.",
    status: "Starting point ready",
  },
  {
    id: "publish",
    number: "03",
    title: "Review it and turn it on",
    description: "Read through the messages once, switch the reply on, and see what Linkar sends.",
    status: "Automatic reply is on",
  },
];

/**
 * Setup happens in Linkar, not on Instagram, so these three previews are
 * fragments of the app's own screens - the Settings connection card, the
 * builder's trigger step, the automations list with its live toggle. Someone who
 * has used the product should recognize each one; someone who has not should be
 * able to tell what the step will actually look like.
 */

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9.5 6 6 6-6" />
    </svg>
  );
}

function TickIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5 10 17.5 19 7" />
    </svg>
  );
}

/** Step 01 - the Instagram connections card from Settings. */
function ConnectPreview() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.eyebrow}>Instagram connections</span>
        <strong>1 account connected</strong>
      </div>
      <div className={styles.channelRow}>
        <span className={styles.channelAvatar} aria-hidden="true">
          <InstagramGlyph size={17} brand />
        </span>
        <span className={styles.channelId}>
          <strong>@brand.acct</strong>
          <span className={styles.rowMeta}>Professional account</span>
        </span>
        <span className={styles.statusPill}>
          <i className={styles.liveDot} />
          Connected
        </span>
      </div>
      <div className={styles.fieldGrid}>
        {["comments", "messages", "mentions", "button taps"].map((field) => (
          <span className={styles.fieldChip} key={field}>
            <i className={styles.tick}><TickIcon /></i>
            {field}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Step 02 - the builder's trigger step, wired to its first action. */
function TriggerPreview() {
  return (
    <div className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={styles.eyebrow}>Step 01<i>·</i>When this happens</span>
        <strong>What should start this reply?</strong>
      </div>
      <label className={styles.field}>
        <span>Where will it start?</span>
        <span className={styles.select}>
          Post &amp; Reel comments
          <i><ChevronIcon /></i>
        </span>
      </label>
      <label className={styles.field}>
        <span>Which comments count?</span>
        <span className={styles.select}>
          A keyword
          <i><ChevronIcon /></i>
        </span>
      </label>
      <div className={styles.keywords}>
        <span>guide</span>
        <span>pdf</span>
        <span className={styles.keywordAdd}>+</span>
      </div>
      {/* The builder's step rail, dropping from the trigger into its action. */}
      <svg className={styles.connector} viewBox="0 0 6 24" fill="none" aria-hidden="true">
        <path d="M3 1v22" />
      </svg>
      <div className={styles.actionRow}>
        <span className={styles.eyebrow}>Step 02<i>·</i>Linkar will do this</span>
        <strong>Send a private reply</strong>
      </div>
    </div>
  );
}

/** Step 03 - the automations list row, switched on. */
function PublishPreview() {
  return (
    <div className={styles.panel}>
      <div className={styles.automationRow}>
        <span className={styles.channelAvatar} aria-hidden="true">
          <InstagramGlyph size={17} brand />
        </span>
        <span className={styles.channelId}>
          <strong>Send a free guide from comments</strong>
          <span className={styles.rowMeta}>Comment replies<i>·</i>2 messages</span>
        </span>
        <svg className={styles.toggle} viewBox="0 0 44 24" aria-hidden="true">
          <rect className={styles.switchTrack} x="0" y="0" width="44" height="24" rx="12" />
          <circle className={styles.switchKnob} cx="32" cy="12" r="9" />
        </svg>
      </div>
      <div className={styles.statRow}>
        <span><strong>1,284</strong>replies sent</span>
        <span><strong>0</strong>failed</span>
        <span className={styles.statusPill} data-live="true">
          <i className={styles.liveDot} />
          On
        </span>
      </div>
    </div>
  );
}

const previews: Record<SetupStep["id"], () => React.JSX.Element> = {
  connect: ConnectPreview,
  trigger: TriggerPreview,
  publish: PublishPreview,
};

function SetupIllustration({ step }: { step: SetupStep }) {
  const label = step.id === "connect"
    ? "Protected Linkar connection preview"
    : step.id === "trigger"
      ? "Linkar reply starting-point preview"
      : "Linkar reply turned on preview";
  const Preview = previews[step.id];

  return (
    <figure className={`${styles.illustration} ${styles[step.id]}`} aria-label={label}>
      <div aria-hidden="true"><Preview /></div>
      <figcaption><span aria-hidden="true" />{step.status}</figcaption>
    </figure>
  );
}

export function SetupSteps() {
  return (
    <section id="setup" className={styles.section} aria-labelledby="setup-title" data-reduced-motion-state="visible">
      <header className={styles.header}>
        <h2 id="setup-title">Start replying in three simple steps.</h2>
        <p>Linkar guides you from connecting an account to turning on your first automatic reply.</p>
      </header>
      <ol className={styles.steps}>
        {setupSteps.map((step, index) => (
          <Reveal as="li" className={styles.revealCard} delay={index * 80} key={step.id}>
            <article className={styles.card} aria-labelledby={`setup-${step.id}-title`}>
              <p className={styles.number}>{step.number}</p>
              <h3 id={`setup-${step.id}-title`}>{step.title}</h3>
              <p className={styles.description}>{step.description}</p>
              <SetupIllustration step={step} />
            </article>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
