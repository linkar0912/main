import { AlertTriangle } from "lucide-react";
import { humanizeProviderError } from "@/src/lib/format/provider-error";

/** What kind of message failed, in the words the rest of the app uses. */
export function deliveryKindLabel(kind: string): string {
  switch (kind) {
    case "CLASSIC_ACTION": return "Reply";
    case "EMAIL_CAPTURE": return "Email capture";
    case "CAMPAIGN_ACTION": return "Campaign";
    case "SEQUENCE_STEP": return "Sequence";
    case "BROADCAST_RECIPIENT": return "Broadcast";
    case "LEAD_EMAIL": return "Lead email";
    case "LEAD_WEBHOOK": return "Lead forwarding";
    case "FLOW_FOLLOWUP": return "Follow-up";
    default: {
      const words = kind.toLowerCase().replaceAll("_", " ");
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
  }
}

/** "Tried once" / "Tried 3 times". */
export function attemptsLabel(count: number): string {
  return count > 1 ? `Tried ${count} times` : "Tried once";
}

/**
 * One delivery failure, rendered the same way everywhere it appears.
 *
 * Both the workspace failure panel and the per-automation diagnostics list the
 * same events, and they had drifted into two different layouts - one of which
 * wrapped `.activity-row` around the badge line only, so the explanation fell
 * outside the border and the timestamp collided with the text beside it.
 *
 * The explanation leads, because it is the only part a customer can act on.
 * Provider result codes (`PROVIDER_REJECTED` and friends) are deliberately not
 * rendered: they are internal vocabulary, and the humanized sentence already
 * carries the same meaning. The untranslated provider string stays on `title`
 * so support can still read it without it reaching the page.
 */
export function DeliveryIssueRow({
  label,
  lastError,
  detail,
  timestamp,
  timeLabel,
  timeTitle,
  state,
  stateLabel,
}: {
  label: string;
  lastError?: string;
  detail?: string;
  timestamp: string;
  timeLabel: string;
  /** Full local date and time, shown on hover when timeLabel is relative. */
  timeTitle?: string;
  state?: "FAILED" | "UNKNOWN";
  stateLabel?: string;
}) {
  const humanized = lastError ? humanizeProviderError(lastError) : null;
  // Meta prefixes many messages with its numeric code ("(#10) ..."); the
  // sentence reads the same without it, and the raw string stays on hover.
  const sentence = humanized ? humanized.text.replace(/^\(#\d+\)\s*/, "") : null;
  const showRaw = humanized && (humanized.translated || sentence !== humanized.text);
  return (
    <li className="failure-row">
      <AlertTriangle className="failure-row-icon" size={16} aria-hidden="true" />
      <div className="failure-row-body">
        <p className="activity-summary" title={showRaw ? humanized.raw : undefined}>
          {sentence ?? "Meta didn’t say why."}
        </p>
        {detail && <small className="failure-row-detail">{detail}</small>}
      </div>
      <div className="failure-row-meta">
        <span className="failure-badge">{label}</span>
        {stateLabel && (
          <span className="failure-state" data-state={state}>
            {stateLabel}
          </span>
        )}
        <time className="failure-row-time" dateTime={timestamp} title={timeTitle}>
          {timeLabel}
        </time>
      </div>
    </li>
  );
}
