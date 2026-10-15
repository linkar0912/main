import type { CSSProperties, ReactNode } from "react";
import { LinkarMark } from "../../linkar-mark";
import type { NextView, ReplyView } from "./seo-example";
import styles from "./mock-ui.module.css";

/*
 * A small kit that draws Instagram's and Facebook's light UI, plus Linkar's
 * builder, for the SEO pages. White surfaces and dark ink in both themes,
 * because they depict the apps, not the site. Decorative: callers wrap them in
 * an aria-hidden container unless the mock carries real page copy.
 */

const iconPaths = {
  heart: "M19.5 12.6 12 20l-7.5-7.4A4.6 4.6 0 0 1 12 6.3a4.6 4.6 0 0 1 7.5 6.3Z",
  link: "M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1.2 1.2M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1.2-1.2",
  sparkle: "M12 3.5c.6 4.4 2.1 6 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.5 5.9-2.1 6.5-6.5ZM18.5 15.5c.2 1.6.8 2.2 2.3 2.3-1.5.2-2.1.8-2.3 2.3-.2-1.5-.8-2.1-2.3-2.3 1.5-.1 2.1-.7 2.3-2.3Z",
  check: "M5 12.5 10 17.5 19 7",
  bolt: "M13 3 5 13.5h6L10 21l8-10.5h-6L13 3Z",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7.5 8.5c.8-3.6 3.8-5.5 7.5-5.5s6.7 1.9 7.5 5.5",
  clock: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.4V12l3.3 2",
  send: "M21 4 3 10.6l6.6 2.3M21 4l-6.5 16-3.6-6.4M21 4 9.9 12.9m0 0v5.3l2-3.7",
  "arrow-right": "M4.5 12h15m0 0-6-6m6 6-6 6",
  download: "M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14",
  chevron: "m6 9.5 6 6 6-6",
  back: "M14.5 4.5 7 12l7.5 7.5",
  comment: "M20.5 11.6c0 4.2-3.8 7.6-8.5 7.6a9.6 9.6 0 0 1-2.6-.35L4.8 20.5l1.2-3.4a7.2 7.2 0 0 1-2.5-5.5C3.5 7.4 7.3 4 12 4s8.5 3.4 8.5 7.6Z",
  image: "M5.5 4.5h13a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2ZM3.5 15.5l4.6-4.6a1.5 1.5 0 0 1 2.1 0l5.3 5.3M14 14l1.6-1.6a1.5 1.5 0 0 1 2.1 0l2.8 2.8M15.5 7.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z",
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({ name, size = 24, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className ? `${styles.icon} ${className}` : styles.icon} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={iconPaths[name]} />
    </svg>
  );
}

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

export type MockTone = "yellow" | "lilac" | "pink" | "mint" | "sky";
export type MockAvatarTone = "yellow" | "lilac" | "pink" | "mint";
const avatarTones: readonly MockAvatarTone[] = ["yellow", "lilac", "pink", "mint"];

function initials(name: string) {
  const parts = name.replace(/^@/, "").split(/[\s._-]+/).filter(Boolean);
  return parts.slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}

function toneFor(name: string): MockAvatarTone {
  let sum = 0;
  for (const char of name) sum += char.charCodeAt(0);
  return avatarTones[sum % avatarTones.length];
}

const sizeStyle = (size: number) => ({ "--avatar-size": `${size}px` }) as CSSProperties;

export function MockAvatar({ name, tone, size = 32, className }: { name: string; tone?: MockAvatarTone; size?: number; className?: string }) {
  return <span className={cx(styles.avatar, className)} data-tone={tone ?? toneFor(name)} style={sizeStyle(size)} aria-hidden="true">{initials(name)}</span>;
}

/** "Your Page" on every Facebook mock: one blue avatar, so the Page always looks like the same account. */
export function MockPageAvatar({ size = 32, className }: { size?: number; className?: string }) {
  return <span className={cx(styles.avatar, styles.pageAvatar, className)} style={sizeStyle(size)} aria-hidden="true">YP</span>;
}

export function MockComment({ handle, text, time = "now", reply = true, className, style }: {
  handle: string; text: ReactNode; time?: string; reply?: boolean; className?: string; style?: CSSProperties;
}) {
  return (
    <div className={cx(styles.surface, styles.comment, className)} style={style}>
      <MockAvatar name={handle} />
      <div className={styles.commentBody}>
        <p className={styles.commentMeta}><strong>{handle}</strong><span>{time}</span></p>
        <p className={styles.commentText}>{text}</p>
        {reply ? <span className={styles.commentReply} aria-hidden="true">Reply</span> : null}
      </div>
      <Icon name="heart" size={15} className={styles.commentHeart} />
    </div>
  );
}

/**
 * A Facebook Page comment: grey bubble, name, text, and the Like / Reply line.
 * `author` marks the Page's own public reply (pass name "Your Page"). `quiet`
 * softens the comment text (not the meta line, which keeps its contrast) so the
 * reply under it leads.
 */
export function MockPublicComment({ name, text, meta = "now · Like · Reply", author = false, quiet = false, className }: {
  name: string; text: ReactNode; meta?: string; author?: boolean; quiet?: boolean; className?: string;
}) {
  return (
    <div className={cx(styles.fbComment, className)} data-author={author ? "true" : undefined} data-quiet={quiet ? "true" : undefined}>
      {author ? <MockPageAvatar size={28} /> : <MockAvatar name={name} size={28} />}
      <div className={styles.fbBody}>
        <div className={styles.fbBubble}>
          <p className={styles.fbName}>{name}{author ? <span className={styles.author}>Author</span> : null}</p>
          <p className={styles.fbText}>{text}</p>
        </div>
        <p className={styles.fbMeta}>{meta}</p>
      </div>
    </div>
  );
}

export function MockBubble({ side, children, className }: { side: "them" | "you"; children: ReactNode; className?: string }) {
  return <div className={cx(styles.bubble, className)} data-side={side}>{children}</div>;
}

/** A DM link button. The icon stays beside the first line when a long label wraps. */
export function MockLinkButton({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.linkButton, className)}><Icon name="link" size={16} /><span>{children}</span></span>;
}

export function MockKeyword({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cx(styles.keyword, className)}>{children}</span>;
}

export function MockStatus({ children, tone = "yellow", className }: { children: ReactNode; tone?: "yellow" | "ink" | "white"; className?: string }) {
  return <span className={cx(styles.status, className)} data-tone={tone}><Icon name="sparkle" size={16} />{children}</span>;
}

/** A centred muted line in a thread: an event ("tara.moves mentioned you in their Story"), a day, or "Later". */
export function MockSystemLine({ children, icon, className }: { children: ReactNode; icon?: IconName; className?: string }) {
  return <p className={cx(styles.system, className)}>{icon ? <Icon name={icon} size={14} /> : null}<span>{children}</span></p>;
}

/** A reply the automation performs rather than a quoted message: a dashed note with a bolt. */
export function MockActionNote({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx(styles.action, className)}><Icon name="bolt" size={14} /><span>{children}</span></p>;
}

/** A step for the business after the reply, or (tag "In public") what the public reply shows: a mono tag and the text. */
export function MockNextNote({ children, tag = "Next", className }: { children: ReactNode; tag?: string; className?: string }) {
  return <p className={cx(styles.nextNote, className)} data-public={tag === "In public" ? "true" : undefined}><span className={styles.nextTag}>{tag}</span><span>{children}</span></p>;
}

/** The page's reply as the right kind of thing: a sent bubble, an automation note, or two test versions. */
export function MockReplyContent({ reply, className }: { reply: ReplyView; className?: string }) {
  if (reply.kind === "quote") return <MockBubble side="you" className={className}>{reply.text}</MockBubble>;
  if (reply.kind === "action") return <MockActionNote className={className}>{reply.text}</MockActionNote>;
  return (
    <div className={cx(styles.variants, className)}>
      {reply.variants.map((variant) => (
        <div className={styles.variant} key={variant.label}>
          <span className={styles.variantTag}>Version {variant.label}</span>
          <MockBubble side="you">{variant.text}</MockBubble>
        </div>
      ))}
    </div>
  );
}

/**
 * What follows the reply: a link button, a later message, or a next-step note.
 * A later message reads as its editorial sentence: the divider says "Later:" and
 * the bubble keeps the quote marks, so "Later: ‘Need help choosing a session?’"
 * stays whole on the page.
 */
export function MockNextContent({ next, className }: { next: NextView; className?: string }) {
  if (next.kind === "button") return <MockLinkButton className={className}>{next.label}</MockLinkButton>;
  if (next.kind === "note") return <MockNextNote className={className} tag={next.tag}>{next.label}</MockNextNote>;
  return (
    <div className={cx(styles.later, className)}>
      <MockSystemLine icon="clock">{next.label}:</MockSystemLine>
      <MockBubble side="you">{next.quoted}</MockBubble>
    </div>
  );
}

export function MockToggleRow({ label, on = true, className }: { label: ReactNode; on?: boolean; className?: string }) {
  return (
    <div className={cx(styles.toggleRow, className)}>
      <span>{label}</span>
      <span className={styles.switch} data-on={on ? "true" : "false"} aria-hidden="true"><i /></span>
    </div>
  );
}

export function MockOption({ label, selected = false, className }: { label: ReactNode; selected?: boolean; className?: string }) {
  return (
    <div className={cx(styles.option, className)} data-selected={selected ? "true" : "false"}>
      <span className={styles.radio} aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

/** A Linkar settings card: brand mark, a title, and stacked rows. */
export function MockPanel({ title, children, className }: { title: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx(styles.surface, styles.panel, className)}>
      <p className={styles.panelHead}><span className={styles.panelMark} aria-hidden="true"><LinkarMark size={12} /></span>{title}</p>
      {children ? <div className={styles.panelBody}>{children}</div> : null}
    </div>
  );
}

/** A plain white UI card with the kit's shadow, for DM cards and contact cards. */
export function MockCard({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div className={cx(styles.surface, styles.card, className)} style={style}>{children}</div>;
}

/**
 * A node in Linkar's automation builder: numbered badge, a coloured mono type
 * chip ("TRIGGER", "MESSAGE", "PUBLIC REPLY", "NEXT STEP") and a mini UI body.
 * `ports` draws the connector dots on the node's edges.
 */
export function MockNode({ step, type, tone = "yellow", ports = "none", children, className }: {
  step: number | string; type: string; tone?: MockTone; ports?: "none" | "in" | "out" | "both"; children?: ReactNode; className?: string;
}) {
  return (
    <div className={cx(styles.surface, styles.node, className)} data-ports={ports}>
      <p className={styles.nodeHead}>
        <span className={styles.nodeStep}>{step}</span>
        <span className={styles.nodeType} data-tone={tone}>{type}</span>
      </p>
      {children ? <div className={styles.nodeBody}>{children}</div> : null}
    </div>
  );
}

/** A lock-screen notification on dark glass: app icon, app name, time, bold title and body. */
export function MockNotification({ app = "Instagram", time = "now", title, children, icon = "comment", tone = "instagram", className }: {
  app?: string; time?: string; title: ReactNode; children?: ReactNode; icon?: IconName; tone?: "instagram" | "facebook" | "linkar"; className?: string;
}) {
  return (
    <div className={cx(styles.notification, className)}>
      <span className={styles.appIcon} data-tone={tone} aria-hidden="true">
        {tone === "linkar" ? <LinkarMark size={16} /> : <Icon name={icon} size={18} />}
      </span>
      <div className={styles.notificationBody}>
        <p className={styles.notificationMeta}><span>{app}</span><span>{time}</span></p>
        <p className={styles.notificationTitle}>{title}</p>
        {children ? <p className={styles.notificationText}>{children}</p> : null}
      </div>
    </div>
  );
}

/** A rich link preview card: a thumbnail (children: any drawn block), a title and a muted subtitle. */
export function MockLinkPreview({ title, subtitle, children, className }: { title: ReactNode; subtitle?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <div className={cx(styles.surface, styles.preview, className)}>
      <div className={styles.previewThumb}>{children ?? <Icon name="link" size={22} />}</div>
      <div className={styles.previewText}>
        <p className={styles.previewTitle}>{title}</p>
        {subtitle ? <p className={styles.previewSub}>{subtitle}</p> : null}
      </div>
    </div>
  );
}

export type MockActivityRow = { name: string; label: ReactNode; status: string; tone?: MockTone };

/** Automation activity without numbers: who, what happened, and a status pill. */
export function MockActivity({ title = "Automation activity", rows, className }: { title?: ReactNode; rows: readonly MockActivityRow[]; className?: string }) {
  return (
    <div className={cx(styles.surface, styles.activity, className)}>
      <p className={styles.panelHead}><span className={styles.panelMark} aria-hidden="true"><LinkarMark size={12} /></span>{title}</p>
      <ul className={styles.activityRows}>
        {rows.map((row, index) => (
          <li key={`${row.name}-${index}`}>
            <MockAvatar name={row.name} size={24} />
            <span className={styles.activityLabel}>{row.label}</span>
            <span className={styles.activityStatus} data-tone={row.tone ?? "mint"}>{row.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
