import type { SeoPage, SeoTopic } from "@/src/content/seo";
import type { ContentBlock } from "@/src/content/seo/types";
import { LinkarMark } from "../../../../linkar-mark";
import { Icon, MockAvatar, MockNextNote, MockNode, MockNotification, MockPageAvatar, type IconName } from "../../mock-ui";
import { nextFor } from "../../seo-example";
import { OutcomeVisual } from "./outcome-visual";
import { destinationPath, type OutcomeKind } from "./outcomes";
import { arrivedLine, notifyLink, pageSections, previewDestination, routeRows, routesByTrigger, type NotifyLink, type Route } from "./panel-copy";
import styles from "./panel-outcome.module.css";

/*
 * Outcome pictures for the large benefit panels: the zigzag rows and the icon
 * list's tall panel. Three outcomes are drawn here for those frames, the rest
 * come from OutcomeVisual:
 * - preview: the linked page as a finished link card, its cover naming the
 *   page and the sections the benefit or reply lists, never a sketch;
 * - routes: only routes the benefit (or the page) supports;
 * - notify: the lock screen with older notifications peeking out below, or,
 *   where the example already draws a phone, a plain notification banner;
 *   a benefit about sending someone to a store page attaches that page.
 * Copy comes from panel-copy.ts. Decorative: callers wrap them in aria-hidden.
 */

function PreviewPanel({ page, benefit }: { page: SeoPage; benefit: ContentBlock }) {
  const destination = previewDestination(page, benefit);
  // No page behind this reply (a thank-you with a personal follow-up): the next step, not an invented page.
  if (!destination) {
    return (
      <MockNode className={styles.nextStep} step={2} type="NEXT STEP" tone="lilac" ports="in">
        <MockNextNote>{nextFor(page).label}</MockNextNote>
      </MockNode>
    );
  }
  const sections = pageSections(page, benefit, destination);
  const facebook = page.topic === "facebook";
  return (
    <div className={styles.link}>
      <div className={styles.cover}>
        <p className={styles.brand}>
          {facebook ? <MockPageAvatar size={22} /> : <MockAvatar name="yourbrand" size={22} tone="yellow" />}
          <span>{facebook ? "Your Page" : "yourbrand"}</span>
        </p>
        <p className={styles.coverTitle}>{destination.title}</p>
        {sections.length ? <p className={styles.sections}>{sections.map((label) => <span key={label}>{label}</span>)}</p> : null}
      </div>
      <p className={styles.linkFoot}>
        <span className={styles.path}>{destinationPath(destination.title)}</span>
        <span className={styles.open}>Open</span>
      </p>
      {/affiliate/i.test(page.example.reply) ? <span className={styles.tag}>Affiliate link</span> : null}
    </div>
  );
}

const routeHeads: Record<SeoTopic, string> = {
  comments: "Replies by post", followers: "Replies by post", stories: "Story replies", messages: "DM keywords",
  leads: "Enquiry keywords", facebook: "Page comment replies", team: "Client campaigns", insights: "Tracked campaigns",
};

const thumbIcons: Record<SeoTopic, IconName> = {
  comments: "image", followers: "image", stories: "image", messages: "send", leads: "send", facebook: "comment", team: "image", insights: "link",
};

/* A destination's width at 12px bold, by letter shape: close enough to round to the next 4px. */
function textWidth(text: string): number {
  let width = 0;
  for (const char of text) {
    width += char === " " ? 2.4 : /[iljI'’.,-]/.test(char) ? 3.4 : /[frt]/.test(char) ? 4.6 : /[mwMW]/.test(char) ? 10.5 : /[A-Z]/.test(char) ? 8.1 : 7.1;
  }
  return width;
}

/*
 * How wide the card's longest route line runs (word chip at 7.68px a letter,
 * arrow, destination pill), rounded up to 4px for the container queries that
 * move every row's destination to a second line together, only when the card
 * is too narrow for that line.
 */
function lineNeed(rows: readonly Route[]): string {
  const widest = Math.max(...rows.map((row) => row.word.length * 7.68 + 84 + textWidth(row.destination)));
  // 148 to 272, matching the container queries in panel-outcome.module.css.
  const need = Math.max(148, Math.ceil((widest + 1) / 4) * 4);
  return need > 272 ? "all" : String(need);
}

function RoutesPanel({ page, benefit, max, head }: { page: SeoPage; benefit: ContentBlock; max: number; head: boolean }) {
  const triggers = routesByTrigger(benefit);
  const rows = routeRows(page, benefit, max);
  return (
    <div className={styles.routes} data-need={lineNeed(rows)}>
      {head ? (
        <p className={styles.routesHead}>
          <span className={styles.mark}><LinkarMark size={12} /></span>
          {triggers ? "Triggers and replies" : routeHeads[page.topic]}
        </p>
      ) : null}
      {rows.map((row, index) => (
        <div className={styles.route} data-to={row.to} data-at={index} key={`${row.source}-${row.word}-${row.to}`}>
          <span className={styles.thumb}>
            <Icon name={triggers ? (["comment", "image", "send"] as const)[index] : thumbIcons[page.topic]} size={16} />
          </span>
          <span className={styles.routeBody}>
            <small>{row.source}</small>
            <span className={styles.routeLine}>
              <b className={styles.word}>{row.word}</b>
              <Icon name="arrow-right" size={14} className={styles.routeArrow} />
              <span className={styles.destination}>
                {row.to === "quiet" ? <i className={styles.quietDash} /> : <Icon name={row.to === "team" ? "user" : "link"} size={13} />}
                <span>{row.destination}</span>
              </span>
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** The page the message links to, attached under the notification as the apps expand a link. */
function LinkAttachment({ link }: { link: NotifyLink }) {
  return (
    <div className={styles.attach}>
      <p className={styles.attachHead}>
        <span className={styles.attachTile}><Icon name="link" size={15} /></span>
        <span className={styles.attachText}><strong>{link.title}</strong><span>{link.path}</span></span>
      </p>
      {link.sections.length ? <p className={styles.attachTags}>{link.sections.map((label) => <span key={label}>{label}</span>)}</p> : null}
    </div>
  );
}

/** The asker's lock screen. Older notifications peek out below the newest one, never through it. */
function NotifyLock({ page, benefit }: { page: SeoPage; benefit: ContentBlock }) {
  const facebook = page.topic === "facebook";
  const link = facebook ? null : notifyLink(page, benefit);
  return (
    <div className={styles.lock}>
      <p className={styles.lockTime}>9:41</p>
      <p className={styles.lockDate}>Tuesday</p>
      <div className={styles.lockStack}>
        {facebook
          ? <MockNotification className={styles.lockNote} app="Facebook" tone="facebook" title="Your Page replied to your comment">See the answer under the post</MockNotification>
          : <MockNotification className={styles.lockNote} app="Instagram" title="yourbrand">{arrivedLine(page, benefit)}</MockNotification>}
        {link ? <LinkAttachment link={link} /> : <><span className={styles.lockLayer} /><span className={styles.lockLayer} /></>}
      </div>
    </div>
  );
}

/** The same arrival as a light banner with no phone around it, for pages whose example already draws a phone. */
function NotifyBanner({ page, benefit }: { page: SeoPage; benefit: ContentBlock }) {
  const facebook = page.topic === "facebook";
  const link = facebook ? null : notifyLink(page, benefit);
  return (
    <div className={styles.banner}>
      <div className={styles.bannerCard}>
        <span className={styles.appTile} data-app={facebook ? "facebook" : "instagram"}>{facebook ? "f" : <Icon name="comment" size={17} />}</span>
        <span className={styles.bannerBody}>
          <span className={styles.bannerMeta}><b>{facebook ? "Facebook" : "Instagram"}</b><span>now</span></span>
          <strong>{facebook ? "Your Page replied to your comment" : "yourbrand"}</strong>
          <span>{facebook ? "See the answer under the post" : arrivedLine(page, benefit)}</span>
        </span>
      </div>
      {link ? <LinkAttachment link={link} /> : <><span className={styles.bannerLayer} /><span className={styles.bannerLayer} /></>}
    </div>
  );
}

/**
 * One benefit's outcome, drawn for a large panel. `rows` caps the routes card
 * and `head` gives it a Linkar header (zigzag rows have room for both), and
 * `phone` swaps the lock screen for a banner when the example draws a phone.
 * `surface` names the panel behind: on the page accent, a link card's cover
 * takes the accent's light tint, so the card never melts into the panel.
 */
export function PanelOutcome({ page, kind, benefit, rows = 2, head = false, phone = false, surface = "light" }: {
  page: SeoPage; kind: OutcomeKind; benefit: ContentBlock; rows?: number; head?: boolean; phone?: boolean; surface?: "accent" | "light";
}) {
  if (kind !== "preview" && kind !== "routes" && kind !== "notify") return <OutcomeVisual page={page} kind={kind} benefit={benefit} />;
  return (
    <div className={styles.outcome} data-outcome={kind} data-surface={surface}>
      {kind === "preview" ? <PreviewPanel page={page} benefit={benefit} />
        : kind === "routes" ? <RoutesPanel page={page} benefit={benefit} max={rows} head={head} />
        : phone ? <NotifyBanner page={page} benefit={benefit} /> : <NotifyLock page={page} benefit={benefit} />}
    </div>
  );
}
