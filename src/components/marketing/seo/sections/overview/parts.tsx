import type { SeoPage } from "@/src/content/seo";
import { MockAvatar, MockComment, MockPublicComment } from "../../mock-ui";
import { incomingFor } from "../../seo-example";
import { isCommentTopic } from "../../seo-theme";
import { splitSentences } from "./copy";
import styles from "./parts.module.css";

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

/** The overview H2 with one sentence per line, so no sentence breaks mid-thought. */
export function OverviewTitle({ text, className, restClassName }: { text: string; className?: string; restClassName?: string }) {
  const sentences = splitSentences(text);
  return (
    <h2 id="overview-title" className={className}>
      {sentences.map((sentence, index) => (
        <span key={index} className={cx(styles.sentence, index > 0 && restClassName)}>
          {sentence}{index < sentences.length - 1 ? " " : null}
        </span>
      ))}
    </h2>
  );
}

/**
 * The page's request as its channel shows it: an Instagram comment, a public
 * Facebook Page comment, a DM or Story reply notification, or, for an event, a
 * single status line. Decorative: callers hide it from assistive tech.
 */
export function RequestCard({ page, handle, time = "now", className }: { page: SeoPage; handle: string; time?: string; className?: string }) {
  const incoming = incomingFor(page);
  if (incoming.kind === "event") {
    return (
      <div className={cx(styles.request, className)}>
        <MockAvatar name={handle} size={36} />
        <p className={cx(styles.requestBody, styles.eventText)}><span><strong>{handle}</strong> {incoming.text}</span></p>
        <span className={styles.requestTime}>{time}<i /></span>
      </div>
    );
  }
  if (page.topic === "facebook") {
    return (
      <div className={cx(styles.fbCard, className)}>
        <MockPublicComment name={handle} text={incoming.text} meta={`${time} · Like · Reply`} />
      </div>
    );
  }
  if (isCommentTopic(page.topic)) return <MockComment className={className} handle={handle} text={incoming.text} time={time} />;
  return (
    <div className={cx(styles.request, className)}>
      <MockAvatar name={handle} size={36} />
      <p className={styles.requestBody}>
        <span className={styles.requestMeta}><strong>{handle}</strong>{page.topic === "stories" ? <span>replied to your Story</span> : null}</span>
        <span className={styles.requestText}>{incoming.text}</span>
      </p>
      <span className={styles.requestTime}>{time}<i /></span>
    </div>
  );
}

/** An older request under a newer one: just the header row (who and when). */
export function RequestStub({ handle, time, className }: { handle: string; time: string; className?: string }) {
  return (
    <div className={cx(styles.stub, className)}>
      <MockAvatar name={handle} size={28} />
      <strong>{handle}</strong>
      <span>{time}</span>
      <i />
    </div>
  );
}
