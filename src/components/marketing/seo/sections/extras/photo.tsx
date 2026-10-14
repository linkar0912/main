import type { SeoPage, SeoTopic } from "@/src/content/seo";
import { seoImageSlot } from "@/src/content/seo/image-slots";
import { SeoImageSlot } from "../../image-slot";
import { Icon, MockAvatar } from "../../mock-ui";
import { exampleHandle, incomingFor, triggerLabel } from "../../seo-example";
import { topicLine } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import slot from "../slot.module.css";
import styles from "./photo.module.css";

type Moment = {
  /** The statement over the photo. Never the overview headline. */
  statement: string;
  /** What someone did, after their handle, as a notification reads it. */
  event: string;
  /** What happened next, in a word or two of product language. */
  outcome: string;
};

type MomentDetail = Omit<Moment, "statement">;

const moments: Record<SeoTopic, MomentDetail> = {
  comments: { event: "commented on your Reel", outcome: "Requested link delivered" },
  messages: { event: "sent you a message", outcome: "Answered with your saved reply" },
  stories: { event: "replied to your Story", outcome: "Answered while the Story is live" },
  leads: { event: "asked about your service", outcome: "Enquiry ready for your team" },
  followers: { event: "commented on your post", outcome: "Resource sent after the check" },
  team: { event: "asked to speak to a person", outcome: "Your team picks it up next" },
  insights: { event: "opened your tracked link", outcome: "Visit logged in activity" },
  facebook: { event: "commented on your Page post", outcome: "Answered publicly in the thread" },
};

/** The topic's statement for this page (seeded, see `topicLine`). A Story mention page shows a mention, not a Story reply. */
function momentFor(page: SeoPage): Moment {
  if (page.topic === "stories" && incomingFor(page).kind === "event") {
    return { statement: "A mention is a small favour. Say thank you.", event: "mentioned you in their Story", outcome: "Thank you sent" };
  }
  return { statement: topicLine(page, "statementLines"), ...moments[page.topic] };
}

export function ExtraPhoto({ page }: { page: SeoPage }) {
  const moment = momentFor(page);
  // The hero uses the first handle; this moment belongs to someone else.
  const handle = exampleHandle(page, 1);
  return (
    <section className={`${shell.section} ${styles.section}`} id="statement" aria-labelledby="statement-title" data-topic={page.topic}>
      <div className={styles.media}>
        <SeoImageSlot className={slot.fill} slot={seoImageSlot({ collection: page.collection, slug: page.slug }, "statement")} sizes="100vw" position="50% 50%" />
      </div>
      <div className={styles.scrim} aria-hidden="true" />

      <div className={`${styles.glass} ${styles.event}`} aria-hidden="true">
        <MockAvatar name={handle} size={30} />
        <p><strong>{handle}</strong> {moment.event}</p>
      </div>
      <div className={`${styles.glass} ${styles.trigger}`} aria-hidden="true">
        <Icon name="bolt" size={14} />{triggerLabel(page)}
      </div>
      <div className={`${styles.glass} ${styles.outcome}`} aria-hidden="true">
        <Icon name="sparkle" size={18} />
        <p>{moment.outcome}</p>
      </div>

      <div className={`${shell.frame} ${styles.content}`}>
        <p className={`${shell.monoPill} ${styles.label}`}>{page.label}</p>
        <h2 id="statement-title" className={`${shell.h2} ${styles.title}`}>{moment.statement}</h2>
      </div>
    </section>
  );
}
