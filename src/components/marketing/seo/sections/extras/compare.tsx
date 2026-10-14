import Link from "next/link";
import type { SeoPage, SeoTopic } from "@/src/content/seo";
import { LinkarMark } from "../../../../linkar-mark";
import { ButtonRoll } from "../../../button-roll";
import { Icon } from "../../mock-ui";
import { incomingFor, isStoryMention, nextFor } from "../../seo-example";
import { topicLine } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import styles from "./compare.module.css";

type Rows = readonly [string, string, string, string];

type CompareCopy = {
  before: { title: string; rows: Rows };
  after: { title: string; rows: Rows };
};

/*
 * Honest workflow statements per topic: what the job looks like by hand and
 * what Linkar actually does instead. Facts follow the topic guides; no numbers.
 * The "With Linkar" titles avoid "once": the final call to action owns it.
 */
const compareCopy: Record<SeoTopic, CompareCopy> = {
  comments: {
    before: {
      title: "Copy, paste, repeat.",
      rows: ["Typing the same link under comment after comment", "Requests buried under newer comments", "Answers that wait until you next open the app", "No record of who already has the link"],
    },
    after: {
      title: "Matching comments, answered.",
      rows: ["A private reply for each matching comment", "Only on the posts and keywords you choose", "The same tested link in every reply", "Activity that shows each delivered reply"],
    },
  },
  messages: {
    before: {
      title: "Retyping from memory.",
      rows: ["Typing the same prices or hours again", "Answers that change from one reply to the next", "Questions waiting until someone is free", "Links dug out of old chats"],
    },
    after: {
      title: "One answer, kept current.",
      rows: ["A prepared reply for the words people send", "A matching mode for exact codes or broader keywords", "A clear route to your team for everything else", "One edit when a price or link changes"],
    },
  },
  stories: {
    before: {
      title: "Catching up later.",
      rows: ["Story replies answered after the Story has gone", "Mentions thanked only when someone notices", "Offer links pasted by hand into each thread", "Replies and mentions treated as the same thing"],
    },
    after: {
      title: "The right reply for each Story.",
      rows: ["Separate triggers for Story replies and mentions", "A request word that sends the offer link", "A short thank you when someone mentions you", "An offer link you update when the promotion ends"],
    },
  },
  leads: {
    before: {
      title: "Chasing details by hand.",
      rows: ["Asking for an email in a separate message later", "Details scattered across chats and notes", "No reason given for the information you need", "Resource requests mixed up with newsletter sign-ups"],
    },
    after: {
      title: "Ask, explain, save.",
      rows: ["The purpose explained before you ask", "Email format checked inside the conversation", "Configured answers saved with the contact", "Retry and exit messages when someone stops"],
    },
  },
  followers: {
    before: {
      title: "Checking profiles one by one.",
      rows: ["Opening profiles to see who follows you", "The follower rule mentioned only after someone asks", "No next step for people who are not following yet", "Links shared before anything is checked"],
    },
    after: {
      title: "A follow check inside the journey.",
      rows: ["The follower requirement stated in the offer", "A follow check after the opening message and opt-in tap", "A not-following message with a supported recheck", "The resource delivered once the check passes"],
    },
  },
  team: {
    before: {
      title: "Nobody sure who replies.",
      rows: ["Complaints answered with a prepared message", "Customers repeating their question to each new person", "Campaign replies interrupting a personal conversation", "No owner for conversations that need a person"],
    },
    after: {
      title: "A clean handoff.",
      rows: ["You choose the moments a person takes over", "Automatic replies pause during the handoff", "The whole conversation stays in the thread", "An honest note about when your team replies"],
    },
  },
  insights: {
    before: {
      title: "Guessing from likes.",
      rows: ["No way to tell a match from a delivered reply", "Link visits lost among general traffic", "Wording, timing and offer all changed together", "A winner declared after a handful of conversations"],
    },
    after: {
      title: "Each stage, on the record.",
      rows: ["Matches, deliveries and tracked visits shown separately", "Activity per automation over comparable periods", "One change at a time when you test a reply", "Sales and bookings checked in the destination’s own records"],
    },
  },
  facebook: {
    before: {
      title: "Typing under every post.",
      rows: ["Answering the same question by hand on each post", "Replies that depend on who checks the Page", "Prices and hours retyped whenever they change", "Older posts left with open questions"],
    },
    after: {
      title: "A public answer, ready.",
      rows: ["Public replies to matching comments on your Page", "Keywords or selected posts decide where it replies", "Wording written for everyone reading the thread", "A maintained page for details that change"],
    },
  },
};

type PageCompare = CompareCopy & { heading?: readonly [problem: string, turn: string] };

/*
 * Pages whose subject is not the topic's usual one get their own rows (and
 * heading where the topic heading would not fit). Each restates the page's
 * own steps and example; the topic copy stays the fallback.
 */
const pageCopy: Record<"mention" | "followUp" | "giveaway" | "support" | "builder" | "agency", PageCompare> = {
  mention: {
    heading: ["Mentions are easy to miss.", "A thank-you shouldn’t be."],
    before: {
      title: "Thanks that come late.",
      rows: ["Mentions noticed days later", "Thank-yous typed one by one", "Reposts without asking first", "Replies and mentions treated as the same thing"],
    },
    after: {
      title: "A thank-you for each mention.",
      rows: ["A Story mention trigger kept apart from Story replies", "A short thank-you sent when someone mentions you", "Permission to reuse asked for separately", "A personal reply when one is needed"],
    },
  },
  followUp: {
    heading: ["Interest can cool after the first answer.", "A timely nudge can help."],
    before: {
      title: "Following up from memory.",
      rows: ["Reminders sent by memory, or not at all", "Check-ins after the window has closed", "The same nudge sent twice", "Deadlines invented to create urgency"],
    },
    after: {
      title: "One check-in, at the right time.",
      rows: ["One check-in at a delay you choose", "Skipped when the person is no longer eligible", "Opt-outs respected", "The same link as the first reply"],
    },
  },
  giveaway: {
    heading: ["Giveaway comments arrive fast.", "Each one can get an honest public answer."],
    before: {
      title: "Acknowledging entries by hand.",
      rows: ["Entries acknowledged one comment at a time", "Rules explained differently in each reply", "Repeat comments answered as new entries", "Replies that sound like a confirmed win"],
    },
    after: {
      title: "A public acknowledgement, ready.",
      rows: ["A public reply to matching comments on the giveaway posts", "The official rules linked in every reply", "Wording that claims only what your process confirms", "Repeat comments tested before launch"],
    },
  },
  support: {
    heading: ["Support questions land in public.", "A calm reply can point them to help."],
    before: {
      title: "Support in the open.",
      rows: ["Order details shared in a public thread", "Support questions answered with a sales message", "No clear route to private help", "Nobody sure who follows up"],
    },
    after: {
      title: "Acknowledge, then route.",
      rows: ["A public acknowledgement that asks for nothing private", "Your real support route in every reply", "Support words kept apart from campaign replies", "An owner for the follow-up process"],
    },
  },
  builder: {
    before: {
      title: "A journey in someone’s head.",
      rows: ["The journey never written down", "Sample text left in a template", "Links and handoffs checked after launch", "Every answer typed by hand"],
    },
    after: {
      title: "Sketch, configure, test.",
      rows: ["The request and first answer written in plain words", "A starting template with your own text and links", "The expected route and a less common answer tested", "No code at any step"],
    },
  },
  agency: {
    heading: ["Client campaigns need sign-off.", "Automate only what the client approved."],
    before: {
      title: "Copy that drifts.",
      rows: ["Client copy reworded in each reply", "Eligibility rules kept in someone’s inbox", "Nobody reviewing the automation after launch", "Exceptions answered without the client"],
    },
    after: {
      title: "Approved, tested, reviewed.",
      rows: ["The client’s approved copy and links in the reply", "Rules and expectations settled before launch", "A regular review time agreed with the client", "Exceptions passed to the client"],
    },
  },
};

/** The page's rows: a page-specific set where the topic copy would not fit, else the topic's. */
function compareFor(page: SeoPage): PageCompare {
  if (isStoryMention(page)) return pageCopy.mention;
  if (nextFor(page).kind === "later") return pageCopy.followUp;
  if (page.topic === "facebook" && /giveaway/.test(page.slug)) return pageCopy.giveaway;
  if (page.topic === "facebook" && /support/.test(page.slug)) return pageCopy.support;
  if (/flow-builder/.test(page.slug)) return pageCopy.builder;
  if (page.topic === "team" && incomingFor(page).kind === "event") return pageCopy.agency;
  return compareCopy[page.topic];
}

/** The last word carries the hand-drawn stroke; trailing punctuation stays outside it. */
function MarkedTitle({ text }: { text: string }) {
  const match = text.match(/^(.*\s)?(\S+?)([.!?]*)$/);
  if (!match) return <>{text}</>;
  const [, lead = "", word, end] = match;
  return <>{lead}<span className={styles.mark}>{word}</span>{end}</>;
}

function Cross() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" aria-hidden="true" focusable="false">
      <path d="M7 7l10 10M17 7 7 17" />
    </svg>
  );
}

export function ExtraCompare({ page }: { page: SeoPage }) {
  const copy = compareFor(page);
  // Two short sentences, the problem then the turn: the page's own, or the topic's picked per page (see `topicLine`).
  const heading = copy.heading ?? topicLine(page, "compareTitles");
  return (
    <section className={`${shell.section} ${shell.canvas}`} id="compare" aria-labelledby="compare-title" data-topic={page.topic}>
      <div className={shell.frame}>
        <header className={shell.head}>
          <p className={shell.monoPill}>Before and after</p>
          <h2 id="compare-title" className={`${shell.h2} ${styles.title}`}>
            <span>{heading[0]}</span>{" "}
            <span className={styles.second}>{heading[1]}</span>
          </h2>
        </header>

        <div className={styles.pair}>
          <article className={`${styles.card} ${styles.before}`} aria-labelledby="compare-before">
            <p className={styles.label}><span className={styles.labelIcon}><Cross /></span>Without a system</p>
            <h3 id="compare-before" className={styles.cardTitle}>{copy.before.title}</h3>
            <ul className={styles.rows}>
              {copy.before.rows.map((row) => (
                <li key={row}><span>{row}</span><span className={styles.tick} aria-hidden="true"><Cross /></span></li>
              ))}
            </ul>
          </article>

          <article className={`${styles.card} ${styles.after} ${shell.accent} ${shell.grid}`} aria-labelledby="compare-after">
            <p className={styles.label}><span className={styles.labelIcon}><LinkarMark size={13} /></span>With Linkar</p>
            <h3 id="compare-after" className={styles.cardTitle}><MarkedTitle text={copy.after.title} /></h3>
            <ul className={styles.rows}>
              {copy.after.rows.map((row) => (
                <li key={row}><span>{row}</span><span className={styles.tick} aria-hidden="true"><Icon name="check" size={16} /></span></li>
              ))}
            </ul>
            <div className={styles.cta}>
              <Link className={shell.inverseAction} href="/signup"><ButtonRoll label="Create your first reply" /></Link>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}
