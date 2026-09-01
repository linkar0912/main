import { AlertTriangle } from "lucide-react";
import { humanizeProviderError } from "@/src/lib/format/provider-error";

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
  state,
  stateLabel,
}: {
  label: string;
  lastError?: string;
  detail?: string;
  timestamp: string;
  timeLabel: string;
  state?: "FAILED" | "UNKNOWN";
  stateLabel?: string;
}) {
  const humanized = lastError ? humanizeProviderError(lastError) : null;
  return (
    <li className="failure-row">
      <AlertTriangle className="failure-row-icon" size={16} aria-hidden="true" />
      <div className="failure-row-body">
        <p className="activity-summary" title={humanized?.translated ? humanized.raw : undefined}>
          {humanized ? humanized.text : "No provider detail was returned."}
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
        <time className="failure-row-time" dateTime={timestamp}>
          {timeLabel}
        </time>
      </div>
    </li>
  );
}
