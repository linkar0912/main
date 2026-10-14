import Link from "next/link";
import type { SeoPage, SeoTopic } from "@/src/content/seo";
import { FREE_BILLING_PLAN } from "@/src/lib/billing/catalog";
import { LinkarMark } from "../../../../linkar-mark";
import { ButtonRoll } from "../../../button-roll";
import { Icon } from "../../mock-ui";
import { isStoryMention, nextFor } from "../../seo-example";
import shell from "../../seo-section.module.css";
import styles from "./checklist.module.css";

type Item = readonly [title: string, body: string];

/* What to prepare for each topic, beyond the account and the plan. */
const prepare: Record<SeoTopic, Item> = {
  comments: ["The link you promise in the post", "A resource, product or guide page you maintain and have opened on a phone."],
  messages: ["The answers you send most often", "Prices, hours or links you can keep up to date in one place."],
  stories: ["A current offer for the Story", "Plus a short thank you for people who mention you in theirs."],
  leads: ["A reason for every detail you ask", "Explain why you need an email or an answer before you ask for it."],
  followers: ["A resource worth following for", "And the follower requirement written into the offer itself."],
  team: ["Someone who owns the inbox", "A person who picks up handed over conversations and knows the context."],
  insights: ["One automation to review", "Plus your destination’s own records for purchases or bookings."],
  facebook: ["A maintained page for details that change", "Point public replies to prices or hours you keep current."],
};

/*
 * Pages whose subject is not the topic's usual one prepare something else: a
 * Story mention page thanks people (no offer), a follow-up page needs its
 * check-in, and the Facebook giveaway and support pages need their rules and
 * help route rather than prices and hours.
 */
function prepareFor(page: SeoPage): Item {
  if (isStoryMention(page)) return ["A short thank-you in your own words", "Plus a plan for asking permission before you reuse someone’s Story."];
  if (nextFor(page).kind === "later") return ["One useful check-in", "Written for the same topic and link as the first reply, with no invented deadline."];
  if (page.topic === "facebook" && /giveaway/.test(page.slug)) return ["Official rules you can link to", "Requirements, dates and how entries and winners are handled, on a page you control."];
  if (page.topic === "facebook" && /support/.test(page.slug)) return ["A support route your team monitors", "A help page or contact route, with honest working hours."];
  return prepare[page.topic];
}

function checklistItems(page: SeoPage): readonly Item[] {
  const facebook = page.topic === "facebook";
  return [
    facebook
      ? ["A Facebook Page you manage", "You must be authorised to manage the Page. Replies are posted publicly under comments."]
      : ["An Instagram professional account", "Business or Creator. Personal Instagram accounts are not supported."],
    prepareFor(page),
    ["The free plan to start", `${FREE_BILLING_PLAN.automationLimit} automations and ${FREE_BILLING_PLAN.monthlyDeliveryLimit.toLocaleString("en-IN")} messages a month. Features and limits depend on the plan.`],
    ["No code", facebook ? "Choose the posts, write the public reply, and test it in a real thread." : "Choose the interaction, write the reply, and test it from another account."],
  ];
}

export function ExtraChecklist({ page }: { page: SeoPage }) {
  const items = checklistItems(page);
  const facebook = page.topic === "facebook";
  return (
    <section className={`${shell.section} ${shell.band}`} id="checklist" aria-labelledby="checklist-title" data-topic={page.topic}>
      <div className={`${shell.frame} ${styles.layout}`}>
        <div className={styles.copy}>
          <p className={shell.monoPill}>Before you start</p>
          <h2 id="checklist-title" className={`${shell.h2} ${styles.title}`}>What you need to start</h2>
          <p className={shell.sub}>
            {facebook
              ? "Four things and no developer. With these ready, you can build this workflow and test it under a real Page post."
              : "Four things and no developer. With these ready, you can build this workflow and test it from another account."}
          </p>
          <div className={shell.actions}>
            <Link className={shell.primaryAction} href="/signup"><ButtonRoll label="Create your first reply" /></Link>
            <Link className={shell.outlineAction} href="/pricing"><ButtonRoll label="See plans" /></Link>
          </div>
        </div>

        <div className={styles.stack}>
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.mark} aria-hidden="true"><LinkarMark size={16} /></span>
              <h3 className={styles.cardTitle}>Setup checklist</h3>
              <span className={styles.channel}>{facebook ? "Facebook Page" : "Instagram"}</span>
            </div>
            <ul className={styles.items}>
              {items.map(([title, body]) => (
                <li key={title}>
                  <span className={styles.box} aria-hidden="true"><Icon name="check" size={16} /></span>
                  <p className={styles.itemTitle}>{title}</p>
                  <p className={styles.itemBody}>{body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
