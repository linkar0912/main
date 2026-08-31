import { Reveal } from "./reveal";
import styles from "./safety-ledger.module.css";

/**
 * The first question anyone asks about an Instagram automation tool is whether
 * it will get their account restricted. The FAQ answers it, but at position ten
 * inside an accordion - so it reads as fine print rather than as the selling
 * point it actually is.
 *
 * Framed as a ledger of platform constraints and what Linkar does about each
 * one, because "we know the rules" is more credible than "we are safe". Every
 * row below is a behaviour that exists in the codebase, not an aspiration:
 *
 *   Official interfaces  app/api/meta/webhook, src/lib/meta/client.ts
 *   24-hour window       src/lib/automation/followup-runner.ts (WINDOW_CLOSED)
 *   Opt-outs             src/lib/automation/runner.ts (OPT_OUT_COMMANDS),
 *                        sequence-runner + broadcast-runner (suppressedAt)
 *   Sealed tokens        src/lib/security/secrets.ts (sealSecret/unsealSecret)
 *   Webhook signatures   verifyWebhookSignature, checked before any rule runs
 *   Repeat events        idempotency keys across the delivery runners
 *   Workspace isolation  every repository query takes a workspaceId
 */
const ledger = [
  {
    rule: "Official interfaces only",
    behaviour:
      "Every reply goes through the Instagram and Facebook interfaces you authorised. Nothing is scraped and no app screen is driven on your behalf.",
  },
  {
    rule: "Meta's 24-hour messaging window",
    behaviour:
      "A follow-up, sequence step, or broadcast that falls outside it is skipped and recorded as skipped - never forced through.",
  },
  {
    rule: "Opt-outs are absolute",
    behaviour:
      "A message of exactly STOP, UNSUBSCRIBE, or REMOVE ME suppresses that person across the whole workspace. It is not a setting you can switch off, and “stop” inside a longer sentence is treated as an ordinary message.",
  },
  {
    rule: "Stored credentials",
    behaviour:
      "Access tokens are encrypted at rest and decrypted only to make a call you configured.",
  },
  {
    rule: "Incoming webhooks",
    behaviour:
      "Every payload's signature is verified against your app secret before a single rule is evaluated.",
  },
  {
    rule: "Repeat events",
    behaviour:
      "Meta re-sends webhooks. Duplicates are recognised and ignored, so nobody receives the same reply twice.",
  },
  {
    rule: "Workspace isolation",
    behaviour:
      "Every query is scoped to one workspace, so connections, contacts, and flows never reach across accounts.",
  },
] as const;

export function SafetyLedger() {
  return (
    <section id="safety" className={styles.section} aria-labelledby="safety-title">
      <div className={styles.frame}>
        <header className={styles.header}>
          <p className={styles.kicker}>Safety</p>
          <h2 id="safety-title">Inside Meta&apos;s rules, by design.</h2>
          <p>
            Linkar only does what the official Instagram and Facebook interfaces allow, and it
            declines on your behalf wherever the platform would.
          </p>
        </header>

        <dl className={styles.ledger}>
          {ledger.map((entry, index) => (
            <Reveal
              as="div"
              className={styles.row}
              key={entry.rule}
              delay={Math.min(index, 4) * 60}
              data-reduced-motion-state="visible"
            >
              <dt>
                <span className={styles.marker} aria-hidden="true" />
                {entry.rule}
              </dt>
              <dd>{entry.behaviour}</dd>
            </Reveal>
          ))}
        </dl>
      </div>
    </section>
  );
}
