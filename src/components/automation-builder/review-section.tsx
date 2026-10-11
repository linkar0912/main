import type { ReactNode } from "react";

/**
 * The review step reads as a short story of what will happen, one sentence
 * per beat, with the exact messages quoted the way the person will see them.
 */
export function ReviewStory({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className="review-story">
      <p className="review-story-title">{title}</p>
      <ol data-testid="review-summary">{children}</ol>
    </div>
  );
}

export function ReviewBeat({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="review-beat">
      <span className="review-beat-icon" aria-hidden>{icon}</span>
      <div className="review-beat-copy">{children}</div>
    </li>
  );
}

/** A message quoted as a chat bubble; long text is clipped to keep the story scannable. */
export function ReviewQuote({ text, link, button }: { text: string; link?: ReactNode; button?: string }) {
  const clipped = text.length > 220 ? `${text.slice(0, 217).trimEnd()}…` : text;
  return (
    <span className="review-quote">
      <span className="review-quote-text">{clipped}</span>
      {link ? <span className="review-quote-link">{link}</span> : null}
      {button ? <span className="review-quote-button">{button}</span> : null}
    </span>
  );
}

/** “a”, “b” or “c” - the keyword list as a person would say it. */
export function quotedList(words: string[], joiner: "or" | "and" = "or"): string {
  const quoted = words.map((word) => `“${word}”`);
  if (quoted.length <= 1) return quoted.join("");
  return `${quoted.slice(0, -1).join(", ")} ${joiner} ${quoted[quoted.length - 1]}`;
}

/** Where the automation runs, as the end of a sentence. */
export function channelPhrase(provider: "INSTAGRAM" | "FACEBOOK", name?: string): string {
  if (provider === "FACEBOOK") return name ? `your Facebook Page ${name}` : "your Facebook Page (choose one in step 1)";
  return name ? `@${name}` : "your Instagram account";
}

/** "90" → "1 hour 30 minutes", "1440" → "1 day". */
export function describeDelay(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts = [
    days ? `${days} day${days === 1 ? "" : "s"}` : "",
    hours ? `${hours} hour${hours === 1 ? "" : "s"}` : "",
    mins ? `${mins} minute${mins === 1 ? "" : "s"}` : "",
  ].filter(Boolean);
  return parts.join(" ");
}
