import type { ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import { LinkarMark } from "../../../../linkar-mark";
import { MockActionNote, MockAvatar, MockBubble } from "../../mock-ui";
import { incomingFor, type IncomingView, type ReplyView } from "../../seo-example";
import styles from "./shared.module.css";

export { exampleContext, type ExampleContext } from "../../seo-example";

/* Pieces every example variant shares: where the request starts, the caption, the brand avatar. */

/** The business in every Instagram mock, and the Page in every Facebook mock. */
export const brandHandle = "yourbrand";
export const pageName = "Your Page";

/**
 * The editorial incoming line when the mock draws it differently: an event
 * ("Someone mentions your account in their Story" becomes a status line) or a
 * typed keyword ("Someone messages COURSE" becomes a COURSE bubble). The
 * caption then states it, so the page keeps the original sentence.
 */
export function scenarioFor(incoming: IncomingView): string | null {
  return incoming.kind === "quote" && incoming.text === incoming.source ? null : incoming.source;
}

export type ReplyVersion = { tag: string; text: string };

/**
 * A test's reply versions as the editorial reply writes them: "Version A:"
 * and the wording in its own quote marks, so the page keeps the sentence whole.
 */
export function replyVersions(page: SeoPage, reply: Extract<ReplyView, { kind: "variants" }>): readonly ReplyVersion[] {
  const source = page.example.reply;
  return reply.variants.map((variant) => {
    const at = source.indexOf(variant.text);
    const open = at > 0 && /[‘“"']/.test(source[at - 1]) ? source[at - 1] : "";
    const after = source[at + variant.text.length] ?? "";
    const close = open && /[’”"']/.test(after) ? after : "";
    const word = source.slice(0, Math.max(at, 0)).match(/(version|variant)\s+[A-Z0-9]+:\s*[‘“"']?$/i)?.[1] ?? "Version";
    return { tag: `${word[0].toUpperCase()}${word.slice(1).toLowerCase()} ${variant.label}:`, text: `${open}${variant.text}${close}` };
  });
}

/** Your side of a DM: the sent bubble, the automation's action, or the test's versions. */
export function ReplyContent({ page, reply }: { page: SeoPage; reply: ReplyView }) {
  if (reply.kind === "quote") return <MockBubble side="you">{reply.text}</MockBubble>;
  if (reply.kind === "action") return <MockActionNote>{reply.text}</MockActionNote>;
  return (
    <div className={styles.versions}>
      {replyVersions(page, reply).map((version) => (
        <div className={styles.version} key={version.tag}>
          <span className={styles.versionTag}>{version.tag}</span>
          <MockBubble side="you">{version.text}</MockBubble>
        </div>
      ))}
    </div>
  );
}

/** "Your reply" reads better than a bare "Reply" on a label. */
export function replyName(page: SeoPage): string {
  if (page.topic === "facebook") return "Public reply";
  return page.topic === "comments" || page.topic === "followers" ? "Private reply" : "Your reply";
}

/** The figure's caption: an Example tag, the scenario when the mock reworded it, then the page's note. */
export function ExampleCaption({ page, tone = "neutral", className }: { page: SeoPage; tone?: "neutral" | "color"; className?: string }) {
  const scenario = scenarioFor(incomingFor(page));
  return (
    <figcaption className={className ? `${styles.caption} ${className}` : styles.caption} data-tone={tone}>
      <span className={styles.tag}>Example</span>
      <span className={styles.text}>
        {scenario ? <><strong>{scenario}.</strong>{" "}</> : null}
        {page.example.note}
      </span>
    </figcaption>
  );
}

/**
 * A step for the business after the reply ("Review delivery and tracked
 * visits"), shown beside the chat rather than inside it: the person never sees
 * it, so it carries Linkar's mark and an "In Linkar" tag.
 */
export function WorkspaceNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={className ? `${styles.workspace} ${className}` : styles.workspace}>
      <span className={styles.workspaceMark} aria-hidden="true"><LinkarMark size={12} /></span>
      <span className={styles.workspaceTag}>In Linkar</span>
      <span className={styles.workspaceText}>{children}</span>
    </p>
  );
}

/** Your own avatar with Instagram's Story ring. */
export function BrandAvatar({ size = 32 }: { size?: number }) {
  return <span className={styles.ring} aria-hidden="true"><MockAvatar name={brandHandle} tone="yellow" size={size} /></span>;
}

/* Glyphs the mock kit does not draw: Instagram's composer and call buttons, Facebook's mark. */
const glyphPaths = {
  camera: "M4 8.5A2.5 2.5 0 0 1 6.5 6h1.3l1.4-2h5.6l1.4 2h1.3A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-8ZM12 16a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  mic: "M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 1 0-6 0v5a3 3 0 0 0 3 3Zm-6-3a6 6 0 0 0 12 0M12 17.5V21",
  smile: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM8.6 14.2a4.4 4.4 0 0 0 6.8 0M9.2 9.8h.01M14.8 9.8h.01",
  video: "M3.5 7.5A1.5 1.5 0 0 1 5 6h9a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 14 18H5a1.5 1.5 0 0 1-1.5-1.5v-9ZM15.5 10.5l5-3v9l-5-3",
  phone: "M5.5 4h3l1.5 4-2 1.3a10 10 0 0 0 6.7 6.7L16 14l4 1.5v3A1.5 1.5 0 0 1 18.5 20 15 15 0 0 1 4 5.5 1.5 1.5 0 0 1 5.5 4Z",
  plus: "M12 5v14M5 12h14",
  thumb: "M7.5 10.5v9h-3v-9h3Zm0 0 3.6-6.2a1.6 1.6 0 0 1 3 .9l-.6 3.8h4.8a1.8 1.8 0 0 1 1.8 2.1l-1.1 6.6a1.8 1.8 0 0 1-1.8 1.5H7.5",
} as const;

export type GlyphName = keyof typeof glyphPaths;

export function Glyph({ name, size = 20, className }: { name: GlyphName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={glyphPaths[name]} />
    </svg>
  );
}

/** A small app tile: Instagram's gradient, Facebook's blue, or Linkar's ink. */
export function AppTile({ app, children }: { app: "instagram" | "facebook" | "linkar"; children?: ReactNode }) {
  return <span className={styles.app} data-app={app} aria-hidden="true">{children ?? (app === "facebook" ? "f" : null)}</span>;
}
