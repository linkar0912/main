import type { ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { ContentBlock } from "@/src/content/seo/types";
import {
  Icon,
  MockActivity,
  MockAvatar,
  MockLinkButton,
  MockLinkPreview,
  MockNotification,
  MockPageAvatar,
  MockPublicComment,
  MockToggleRow,
  type IconName,
  type MockActivityRow,
} from "../../mock-ui";
import { exampleHandle, incomingFor, nextFor, postCaption, replyFor } from "../../seo-example";
import {
  benefitDestination,
  campaignPost,
  collectsEmail,
  destinationFor,
  destinationPath,
  menuItems,
  otherCampaign,
  pipelineMode,
  sourceLabel,
  type OutcomeKind,
} from "./outcomes";
import styles from "./outcomes.module.css";

/*
 * The outcome pictures for benefits. One light element each, drawn as the
 * apps draw it, and never the reply text or status pill the hero and example
 * already show. Decorative: callers put them inside an aria-hidden block.
 */

type VisualProps = { page: SeoPage; benefit: ContentBlock };

/** A small icon for each outcome, for icon lists. */
export const outcomeIcons: Record<OutcomeKind, IconName> = {
  notify: "send", preview: "link", caption: "comment", routes: "arrow-right", boundary: "check",
  menu: "link", contact: "user", search: "user", handoff: "user", pipeline: "check",
  activity: "bolt", public: "comment", gate: "user", schedule: "clock", optout: "clock", retry: "sparkle",
};

const titleCase = (text: string) => text.toLowerCase().replace(/(^|\s)\S/g, (char) => char.toUpperCase());
const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(" ");

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx(styles.card, className)}>{children}</div>;
}

function Head({ children, icon }: { children: ReactNode; icon?: IconName }) {
  return <p className={styles.head}>{icon ? <span className={styles.headIcon}><Icon name={icon} size={14} /></span> : null}{children}</p>;
}

function SearchIcon() {
  return (
    <svg className={styles.searchIcon} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true" focusable="false">
      <circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" />
    </svg>
  );
}

function PauseIcon() {
  return <span className={styles.pauseIcon} aria-hidden="true"><i /><i /></span>;
}

/* 1. The asker's lock screen: the answer has arrived. */
function NotifyVisual({ page }: VisualProps) {
  const facebook = page.topic === "facebook";
  const incoming = incomingFor(page);
  const origin = page.topic === "comments" || page.topic === "followers" ? "Replied to your comment"
    : page.topic === "stories" ? (incoming.kind === "event" ? "Replied to your Story mention" : "Answered your Story reply")
    : "Sent you a message";
  return (
    <div className={styles.lock}>
      <p className={styles.lockTime}>9:41</p>
      <p className={styles.lockDate}>Tuesday</p>
      <div className={styles.stack}>
        {facebook
          ? <MockNotification app="Facebook" tone="facebook" title="Your Page replied to your comment">See the answer under the post</MockNotification>
          : <MockNotification app="Instagram" title="yourbrand">{origin}</MockNotification>}
        <span className={styles.stackLayer} />
        <span className={styles.stackLayer} />
      </div>
    </div>
  );
}

/* 2. The page the reply opens, as a rich preview. */
function PreviewVisual({ page, benefit }: VisualProps) {
  const destination = benefitDestination(page, benefit);
  const affiliate = /affiliate/i.test(page.example.reply);
  return (
    <div className={styles.previewWrap}>
      <MockLinkPreview className={styles.preview} title={destination.title} subtitle={destinationPath(destination.title)}>
        <span className={styles.sketch}>
          <span className={styles.sketchHero}><Icon name="image" size={22} /></span>
          <span className={styles.sketchLines}><i /><i /><i /><b /></span>
        </span>
      </MockLinkPreview>
      {affiliate ? <span className={styles.floatTag}>Affiliate link</span> : <span className={styles.cursor}><Icon name="arrow-right" size={14} /></span>}
    </div>
  );
}

/* 3. The caption's promise, joined to the reply that keeps it. */
function CaptionVisual({ page }: VisualProps) {
  const keyword = incomingFor(page).keyword;
  const caption = postCaption(page);
  const parts = keyword ? caption.split(keyword) : [caption];
  const next = nextFor(page);
  const destination = destinationFor(page);
  return (
    <div className={styles.caption}>
      <Card className={styles.captionCard}>
        {page.topic === "facebook" ? <MockPageAvatar size={28} /> : <MockAvatar name="yourbrand" size={28} />}
        <p>
          <strong>{page.topic === "facebook" ? "Your Page" : "yourbrand"}</strong>{" "}
          {parts.map((part, index) => (
            <span key={index}>{index > 0 ? <b className={styles.captionWord}>{keyword}</b> : null}{part}</span>
          ))}
        </p>
      </Card>
      <span className={styles.connector} aria-hidden="true"><Icon name="arrow-right" size={14} /></span>
      {page.topic === "facebook"
        ? <span className={styles.pagePill}><MockPageAvatar size={22} />Your Page answered in the thread</span>
        : <MockLinkButton className={styles.captionButton}>{next.kind === "button" ? next.label : `Open the ${destination.title.toLowerCase()}`}</MockLinkButton>}
    </div>
  );
}

type RouteRow = { icon: IconName; source: string; word: string; destination: string };

function routeRows(page: SeoPage, benefit: ContentBlock): RouteRow[] {
  const own = benefitDestination(page, benefit);
  const other = otherCampaign(own, page.topic);
  if (/story repl\w*.*\b(dm|message)/i.test(benefit[1])) {
    return [
      { icon: "comment", source: "Reel comment", word: "GUIDE", destination: "Free guide" },
      { icon: "image", source: "Story reply", word: "DEAL", destination: "Offer details" },
      { icon: "send", source: "Incoming DM", word: own.word === "GUIDE" || own.word === "DEAL" ? "MENU" : own.word, destination: own.title },
    ];
  }
  const posts = /\bposts?\b|reel|media|campaign/i.test(benefit.join(" "));
  const sources: Record<SeoPage["topic"], [string, string]> = {
    comments: ["This Reel", other.post],
    followers: ["This Reel", other.post],
    stories: ["Today’s Story", "Earlier Story"],
    facebook: posts ? [campaignPost(own.word), other.post] : ["Comment says", "Comment says"],
    team: ["Client A", "Client B"],
    messages: ["Keyword", "Keyword"],
    leads: ["Keyword", "Keyword"],
    insights: ["Campaign", "Campaign"],
  };
  const [first, second] = sources[page.topic];
  const keywordRows = page.topic === "messages" || page.topic === "leads" || page.topic === "insights" || (page.topic === "facebook" && !posts);
  const icon: IconName = keywordRows ? (page.topic === "facebook" ? "comment" : "send") : "image";
  return [
    { icon, source: first, word: own.word, destination: own.title },
    { icon, source: second, word: other.word, destination: other.title },
  ];
}

/* 4. Right post, right link: each campaign keeps its own destination. */
function RoutesVisual({ page, benefit }: VisualProps) {
  return (
    <Card className={styles.routes}>
      {routeRows(page, benefit).map((row) => (
        <div className={styles.route} key={`${row.source}-${row.word}`}>
          <span className={styles.thumb}><Icon name={row.icon} size={16} /></span>
          <span className={styles.routeBody}>
            <small>{row.source}</small>
            <span className={styles.routeLine}>
              <b className={styles.word}>{row.word}</b>
              <span className={styles.routeTo}>
                <Icon name="arrow-right" size={15} className={styles.routeArrow} />
                <span className={styles.routeDestination}><Icon name="link" size={13} />{row.destination}</span>
              </span>
            </span>
          </span>
        </div>
      ))}
    </Card>
  );
}

/* 5. Where it answers, and where it stays quiet. */
function BoundaryVisual({ page, benefit }: VisualProps) {
  const text = benefit.join(" ");
  const word = destinationFor(page).word;
  const facebook = page.topic === "facebook";
  const rows = /returning|next visit|new\b/i.test(text)
    ? [{ label: "Someone new says hello", state: "Welcome sent" }, { label: "A returning contact asks", state: "Topic reply" }]
    : /\bposts?\b/i.test(text)
      ? [{ label: "Comment on the selected post", state: facebook ? "Public reply" : "Replied" }, { label: "Comment on an unrelated post", state: "Stays quiet" }]
      : [{ label: `Asks about ${titleCase(word)}`, state: facebook ? "Public reply" : "Replied" }, { label: `Says ${word.toLowerCase()} in passing`, state: "Stays quiet" }];
  return (
    <Card className={styles.boundary}>
      {rows.map((row, index) => (
        <div className={styles.boundaryRow} data-on={index === 0 ? "true" : "false"} key={row.label}>
          <span className={styles.boundaryDot}>{index === 0 ? <Icon name="check" size={13} /> : <i />}</span>
          <span className={styles.boundaryLabel}>{row.label}</span>
          <span className={styles.boundaryState}>{row.state}</span>
        </div>
      ))}
    </Card>
  );
}

/* 6. A short link menu: three named pages, nothing more. */
function MenuVisual({ page }: VisualProps) {
  return (
    <Card className={styles.menu}>
      <Head>Choose a page</Head>
      {menuItems(page).map((item) => <MockLinkButton key={item}>{item}</MockLinkButton>)}
    </Card>
  );
}

/** What the person asked about, in a few words: "Coaching", "Help with my order", "Price list". */
function requestTopic(page: SeoPage): string {
  const incoming = incomingFor(page);
  if (incoming.keyword) return titleCase(incoming.keyword);
  const interest = incoming.source.match(/interested in (?:the |a |an )?([^.?!,]+)/i)?.[1];
  if (interest) return titleCase(interest.trim());
  const help = incoming.source.match(/\b(help (?:with|from) [^.?!,]+)/i)?.[1];
  if (help) return help.charAt(0).toUpperCase() + help.slice(1);
  const destination = destinationFor(page);
  return destination.title === "Resource page" ? "More information" : destination.title;
}

/* 7. The person, with what they asked for kept beside them. */
function ContactVisual({ page }: VisualProps) {
  const handle = exampleHandle(page, 0);
  const email = collectsEmail(page);
  const second: [string, ReactNode] = email
    ? ["Email", <span className={styles.saved} key="email"><Icon name="check" size={12} />Saved</span>]
    : page.topic === "team" ? ["Status", "With your team"]
    : ["Source", sourceLabel(page)];
  const topicTag: Record<SeoPage["topic"], string> = {
    comments: "Reel comment", messages: "Message", stories: "Story", leads: "New enquiry",
    followers: "Follower", team: "Needs a person", insights: "Tracked link", facebook: "Page comment",
  };
  return (
    <Card className={styles.contact}>
      <div className={styles.contactHead}>
        <MockAvatar name={handle} size={40} />
        <p><strong>{handle}</strong><span>Instagram</span></p>
      </div>
      <dl className={styles.fields}>
        <div><dt>Asked for</dt><dd>{requestTopic(page)}</dd></div>
        <div><dt>{second[0]}</dt><dd>{second[1]}</dd></div>
      </dl>
      <p className={styles.tags}>
        <span>{topicTag[page.topic]}</span>
        <span>Context kept</span>
      </p>
    </Card>
  );
}

/* 8. Contact search: the enquiry is easy to find again. */
function SearchVisual({ page }: VisualProps) {
  const incoming = incomingFor(page);
  const interest = incoming.keyword?.toLowerCase()
    ?? incoming.source.match(/interested in (?:the |a |an )?([^.?!,]+)/i)?.[1].trim().toLowerCase()
    ?? "service";
  const saved = collectsEmail(page) ? "Email saved" : "Timing saved";
  return (
    <Card className={styles.search}>
      <p className={styles.searchBar}><SearchIcon /><span>{interest}</span></p>
      <ul className={styles.results}>
        {[0, 1].map((index) => (
          <li key={index}>
            <MockAvatar name={exampleHandle(page, index)} size={28} />
            <span className={styles.resultName}>{exampleHandle(page, index)}</span>
            <span className={styles.resultChips}><i>{titleCase(interest)}</i>{index === 0 ? <i>{saved}</i> : null}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* 9. The team inbox: automation has stepped aside for a person. */
function HandoffVisual({ page }: VisualProps) {
  const handle = exampleHandle(page, 1);
  const team = page.topic === "team";
  return (
    <Card className={styles.inbox}>
      <p className={styles.inboxHead}><span>Team inbox</span><span className={styles.inboxFilter}>Assigned to you</span></p>
      <div className={styles.inboxRow}>
        <MockAvatar name={handle} size={34} />
        <span className={styles.inboxText}><strong>{handle}</strong><small>Waiting for a person</small></span>
        <span className={styles.paused}>{team ? <><PauseIcon />Automation paused</> : <><Icon name="user" size={12} />Needs a person</>}</span>
      </div>
      <p className={styles.composer}><MockAvatar name="You" size={22} tone="lilac" /><span className={styles.composerText}>Reply as your team</span><Icon name="send" size={15} /></p>
    </Card>
  );
}

type Stage = { name: string; detail: string; done: boolean };

function pipelineStages(page: SeoPage, benefit: ContentBlock): Stage[] {
  const destination = destinationFor(page);
  const incoming = incomingFor(page);
  if (pipelineMode(page, benefit) === "journey") {
    const matched = incoming.kind === "event" ? "Interaction matched" : incoming.keyword ? `Said ${incoming.keyword}` : "Question matched";
    const opened = !/does not establish|separate signals|evidence/i.test(benefit.join(" "));
    return [
      { name: "Matched", detail: matched, done: true },
      { name: "Delivered", detail: "Reply delivered", done: true },
      { name: "Link opened", detail: opened ? `Opened the ${destination.title.toLowerCase()}` : "Not opened yet", done: opened },
    ];
  }
  const text = benefit.join(" ");
  const last: [string, string] = /regist|joining|attendee/i.test(text) ? ["Registration", "Completed on the event page"]
    : /session|booking|\bbook/i.test(text) ? ["Booking", "Confirmed on the booking page"]
    : /support|expectation|hours/i.test(text) ? ["Personal reply", "During your support hours"]
    : /availab|listing|status/i.test(text) ? ["Availability", "Confirmed by your team"]
    : /collection|steps/i.test(text) ? ["Next step", "Added only if it helps"]
    : ["Confirmation", "Handled by your team"];
  return [
    { name: "Request received", detail: sourceLabel(page), done: true },
    page.topic === "team"
      ? { name: "In your team inbox", detail: "With the conversation so far", done: true }
      : { name: `${destination.title} sent`, detail: "Link in the reply", done: true },
    { name: last[0], detail: last[1], done: false },
  ];
}

/* 10. One person's journey, stage by stage. No totals, only what happened. */
function PipelineVisual({ page, benefit }: VisualProps) {
  const handle = exampleHandle(page, 2);
  return (
    <Card className={styles.pipeline}>
      <p className={styles.pipeHead}><MockAvatar name={handle} size={24} /><strong>{handle}</strong><span className={styles.pipeTag}>{pipelineMode(page, benefit) === "journey" ? "Journey" : "Status"}</span></p>
      <ol className={styles.stages}>
        {pipelineStages(page, benefit).map((stage) => (
          <li key={stage.name} data-done={stage.done ? "true" : "false"}>
            <span className={styles.stageDot}>{stage.done ? <Icon name="check" size={12} /> : <Icon name="clock" size={12} />}</span>
            <span className={styles.stageText}><b>{stage.name}</b><small>{stage.detail}</small></span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

/* 11. Automation activity with status pills, never counts. */
function ActivityVisual({ page }: VisualProps) {
  const reply = replyFor(page);
  const destination = destinationFor(page);
  const [a, b, c] = [0, 1, 2].map((index) => exampleHandle(page, index));
  const rows: MockActivityRow[] = reply.kind === "variants"
    ? [
      { name: a, label: `Version ${reply.variants[0].label}`, status: "Reply delivered", tone: "mint" },
      { name: b, label: `Version ${reply.variants[1].label}`, status: "Reply delivered", tone: "lilac" },
      { name: c, label: `Version ${reply.variants[0].label}`, status: "Link opened", tone: "sky" },
    ]
    : [
      { name: a, label: incomingFor(page).kind === "event" ? "Request matched" : `${sourceLabel(page)} matched`, status: "Reply delivered", tone: "mint" },
      { name: b, label: `Opened the ${destination.title.toLowerCase()}`, status: "Link opened", tone: "sky" },
      { name: c, label: "Destination unavailable", status: "Needs attention", tone: "pink" },
    ];
  return <MockActivity className={styles.activity} rows={rows} />;
}

/* 12. Facebook: the answer sits in the public thread for every reader. */
function PublicVisual({ page }: VisualProps) {
  const incoming = incomingFor(page);
  return (
    <Card className={styles.public}>
      <p className={styles.publicHead}>Most relevant <Icon name="chevron" size={14} /></p>
      <MockPublicComment name={exampleHandle(page, 1)} text={incoming.text} meta="2h · Like · Reply" />
      <p className={styles.collapsed}><span className={styles.elbow} /><MockPageAvatar size={20} /><strong>Your Page</strong><span>replied</span></p>
      <span className={styles.visible}>Visible to everyone on the post</span>
    </Card>
  );
}

/* 13. The follower check: one path delivers, the other can try again. */
function GateVisual({ page }: VisualProps) {
  const [follower, visitor] = [exampleHandle(page, 0), exampleHandle(page, 1)];
  return (
    <Card className={styles.gate}>
      <Head icon="user">Follower check</Head>
      <div className={styles.gateRow}>
        <MockAvatar name={follower} size={26} />
        <span className={styles.gateName}>{follower}</span>
        <span className={styles.okChip}><Icon name="check" size={12} />Following</span>
      </div>
      <div className={styles.gateRow}>
        <MockAvatar name={visitor} size={26} />
        <span className={styles.gateName}>{visitor}<small>Not following yet</small></span>
        <span className={styles.recheck}>Check again</span>
      </div>
    </Card>
  );
}

/* 14. A later message that waits for the right moment, or does not send. */
function ScheduleVisual({ page }: VisualProps) {
  const next = nextFor(page);
  return (
    <Card className={styles.schedule}>
      <Head icon="clock">{next.kind === "later" ? next.label : "Follow-up"}</Head>
      <ol className={styles.stages}>
        <li data-done="true"><span className={styles.stageDot}><Icon name="check" size={12} /></span><span className={styles.stageText}><b>First reply</b><small>Delivered now</small></span></li>
        <li data-done="false"><span className={styles.stageDot}><Icon name="clock" size={12} /></span><span className={styles.stageText}><b>Check-in</b><small>Later, if still eligible</small></span></li>
      </ol>
      <span className={styles.windowChip}>Skipped if the window has closed</span>
    </Card>
  );
}

/* 15. The person said stop, so the reminders are off. */
function OptoutVisual({ page }: VisualProps) {
  return (
    <Card className={styles.optout}>
      <Head icon="clock">Follow-ups</Head>
      <MockToggleRow label={`Reminders for ${exampleHandle(page, 0)}`} on={false} />
      <p className={styles.optoutNote}>Opted out. No more nudges.</p>
    </Card>
  );
}

/* 16. A kind retry: the typo is caught, the address is saved. */
function RetryVisual({ page }: VisualProps) {
  const name = exampleHandle(page, 1).split(/[._\s]/)[0].toLowerCase();
  return (
    <Card className={styles.retry}>
      <Head>Email address</Head>
      <p className={styles.field} data-state="error">{name}@gmail</p>
      <p className={styles.hint}>That address looks incomplete. Could you check it?</p>
      <p className={styles.field} data-state="ok">{name}@gmail.com<Icon name="check" size={14} /></p>
    </Card>
  );
}

const visuals: Record<OutcomeKind, (props: VisualProps) => ReactNode> = {
  notify: NotifyVisual, preview: PreviewVisual, caption: CaptionVisual, routes: RoutesVisual,
  boundary: BoundaryVisual, menu: MenuVisual, contact: ContactVisual, search: SearchVisual,
  handoff: HandoffVisual, pipeline: PipelineVisual, activity: ActivityVisual, public: PublicVisual,
  gate: GateVisual, schedule: ScheduleVisual, optout: OptoutVisual, retry: RetryVisual,
};

/** The outcome picture for one benefit. Sized for a 320px stage. */
export function OutcomeVisual({ page, kind, benefit }: { page: SeoPage; kind: OutcomeKind; benefit: ContentBlock }) {
  const Visual = visuals[kind];
  return <div className={styles.outcome} data-outcome={kind}><Visual page={page} benefit={benefit} /></div>;
}
