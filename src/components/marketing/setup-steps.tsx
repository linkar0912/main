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
    title: "Connect your professional account",
    description: "Authorize the messaging connection securely and confirm the account you want Linkar to use.",
    status: "Connection protected",
  },
  {
    id: "trigger",
    number: "02",
    title: "Choose a trigger",
    description: "Pick the comment, message, mention, or campaign condition that should begin the flow.",
    status: "Trigger ready",
  },
  {
    id: "publish",
    number: "03",
    title: "Publish the flow",
    description: "Review the path, switch it on, and watch each conversation move through visible states.",
    status: "Flow live",
  },
];

function SetupIllustration({ step }: { step: SetupStep }) {
  const label = step.id === "connect"
    ? "Protected Linkar connection preview"
    : step.id === "trigger"
      ? "Linkar trigger preview"
      : "Published Linkar flow preview";

  return (
    <figure className={`${styles.illustration} ${styles[step.id]}`} aria-label={label}>
      {step.id === "connect" ? (
        <svg viewBox="0 0 320 250" fill="none" aria-hidden="true">
          <rect x="31" y="24" width="258" height="196" rx="22" className={styles.previewFrame} />
          <path d="M160 56 205 76v42c0 34-19 58-45 70-26-12-45-36-45-70V76l45-20Z" className={styles.shield} />
          <path d="m140 116 13 13 28-31" className={styles.shieldCheck} />
          <path d="M72 176h176" className={styles.rule} />
          <circle cx="88" cy="176" r="8" className={styles.voltDot} />
          <circle cx="232" cy="176" r="8" className={styles.voltDot} />
        </svg>
      ) : null}
      {step.id === "trigger" ? (
        <svg viewBox="0 0 320 250" fill="none" aria-hidden="true">
          <rect x="31" y="24" width="258" height="196" rx="22" className={styles.previewFrame} />
          <rect x="58" y="60" width="82" height="42" rx="12" className={styles.lightCard} />
          <rect x="180" y="148" width="82" height="42" rx="12" className={styles.lightCard} />
          <path d="M140 81h38c18 0 22 20 22 37v30" className={styles.connector} />
          <circle cx="160" cy="81" r="10" className={styles.magentaDot} />
          <circle cx="200" cy="148" r="10" className={styles.voltDot} />
          <path d="M77 81h44M199 169h44" className={styles.cardLine} />
        </svg>
      ) : null}
      {step.id === "publish" ? (
        <svg viewBox="0 0 320 250" fill="none" aria-hidden="true">
          <rect x="31" y="24" width="258" height="196" rx="22" className={styles.previewFrame} />
          <path d="M80 101h160" className={styles.rule} />
          <path d="M80 148h160" className={styles.rule} />
          <rect x="188" y="63" width="59" height="31" rx="16" className={styles.switchTrack} />
          <circle cx="226" cy="79" r="11" className={styles.switchKnob} />
          <circle cx="80" cy="101" r="9" className={styles.voltDot} />
          <circle cx="160" cy="148" r="9" className={styles.magentaDot} />
          <circle cx="240" cy="148" r="9" className={styles.voltDot} />
        </svg>
      ) : null}
      <figcaption><span aria-hidden="true" />{step.status}</figcaption>
    </figure>
  );
}

export function SetupSteps() {
  return (
    <section id="setup" className={styles.section} aria-labelledby="setup-title" data-reduced-motion-state="visible">
      <header className={styles.header}>
        <h2 id="setup-title">From first connection to live flow in three clear steps.</h2>
        <p>Linkar keeps setup focused so you can spend your judgment on the conversation.</p>
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
