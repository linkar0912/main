import Link from "next/link";
import { seoPagePath, type SeoCollection, type SeoPage } from "@/src/content/seo";
import { HashLink } from "../../hash-link";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import styles from "./channels.module.css";

type Channel = {
  key: "instagram" | "facebook";
  name: string;
  account: string;
  detail: string;
  supports: readonly string[];
  href: string;
  /** The hidden end of the card's "Learn more" link, worded per collection. */
  more: Readonly<Record<SeoCollection, string>>;
};

/**
 * The hidden end of the Facebook card's "Learn more" link to the Facebook Page
 * comment reply feature. Worded per collection so one anchor is not repeated on
 * every page that shows the channel cards.
 */
export const facebookRepliesLinkText: Readonly<Record<SeoCollection, string>> = {
  features: "about automatic Facebook Page comment replies",
  solutions: "about replying to Facebook Page comments",
  templates: "about the Facebook Page comment auto reply feature",
};

/**
 * The hidden end of the Instagram card's link to the features hub. It leaves
 * out "Instagram automation": sitewide anchors with that phrase point at the
 * homepage, not at a hub.
 */
export const instagramFeaturesLinkText = "about Linkar’s Instagram features";

/* Facts match the FAQ answer to "Which account do I need?" on every page. */
const channels: readonly Channel[] = [
  {
    key: "instagram",
    name: "Instagram",
    account: "An Instagram professional account, either Business or Creator.",
    detail: "Private replies to comments and supported conversation journeys. Personal Instagram accounts are not supported.",
    supports: ["Comment replies", "DMs", "Story replies", "Story mentions"],
    href: "/features",
    more: { features: instagramFeaturesLinkText, solutions: instagramFeaturesLinkText, templates: instagramFeaturesLinkText },
  },
  {
    key: "facebook",
    name: "Facebook Page",
    account: "A Facebook Page you are authorised to manage.",
    detail: "Replies are posted publicly under comments on your Page posts, so everyone reading the thread sees the answer.",
    supports: ["Public comment replies", "Selected Page posts", "Keywords"],
    href: "/features/facebook-comment-auto-reply",
    more: facebookRepliesLinkText,
  },
];

function Glyph({ channel }: { channel: Channel["key"] }) {
  return (
    <span className={styles.glyph} data-channel={channel} aria-hidden="true">
      <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {channel === "instagram"
          ? <path d="M7.5 3.5h9a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4ZM12 15.8a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6ZM17.2 6.9h.01" />
          : <path d="M5.5 21V4.5m0 0h11l-2.4 4 2.4 4h-11" />}
      </svg>
    </span>
  );
}

export function ExtraChannels({ page }: { page: SeoPage }) {
  const own: Channel["key"] = page.topic === "facebook" ? "facebook" : "instagram";
  // The page's own channel comes first and carries the tag.
  const ordered = [...channels].sort((a, b) => Number(b.key === own) - Number(a.key === own));
  const tag = page.collection === "templates" ? "This recipe" : "This guide";
  const path = seoPagePath(page);
  return (
    <section className={`${shell.section} ${shell.yellow} ${shell.grid}`} id="channels" aria-labelledby="channels-title" data-topic={page.topic}>
      <div className={shell.frame}>
        <header className={shell.head}>
          <p className={shell.monoPill}>Supported channels</p>
          <h2 id="channels-title" className={`${shell.h2} ${styles.title}`}>Where this works</h2>
          <p className={shell.sub}>Linkar connects to Instagram professional accounts and Facebook Pages. What an automation can do depends on the channel and the account you connect.</p>
        </header>
        <ul className={styles.cards}>
          {ordered.map((channel) => {
            // Never link a page to itself: send the reader to its setup steps instead.
            const self = channel.href === path;
            return (
              <li key={channel.key} className={styles.card}>
                {channel.key === own ? <span className={styles.here}>{tag}</span> : null}
                <h3 className={styles.name}><Glyph channel={channel.key} /><span className={styles.nameText}>{channel.name}</span></h3>
                <p className={styles.account}>{channel.account}</p>
                <p className={styles.detail}>{channel.detail}</p>
                <ul className={styles.chips} aria-label={`${channel.name} supports`}>
                  {channel.supports.map((item) => <li key={item}><Icon name="check" size={15} />{item}</li>)}
                </ul>
                <div className={styles.more}>
                  {self ? (
                    <HashLink className={`${shell.textAction} ${styles.link}`} href="#how-it-works">See how it works<Icon name="arrow-right" size={16} /></HashLink>
                  ) : (
                    <Link className={`${shell.textAction} ${styles.link}`} href={channel.href}>Learn more<span className={shell.srOnly}> {channel.more[page.collection]}</span><Icon name="arrow-right" size={16} /></Link>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
