import { getSeoPages, seoTopics, type SeoCollection, type SeoTopic } from "@/src/content/seo";
import { Icon, type IconName } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import { topicVisuals } from "../../seo-theme";
import styles from "./hub-groups.module.css";
import { SeoPageCardList } from "./page-card";

const triggerIcons: Record<SeoTopic, IconName> = {
  comments: "comment",
  messages: "send",
  stories: "heart",
  leads: "user",
  followers: "user",
  team: "user",
  insights: "bolt",
  facebook: "comment",
};

function countLabel(collection: SeoCollection, count: number) {
  const noun = collection === "templates" ? "recipe" : "guide";
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

/**
 * One group per topic: a count pill and the topic as H2, what the topic does as
 * trigger and result chips, then the topic's cards. A short last row simply ends
 * short, like Manychat's hub grids.
 */
export function SeoHubGroups({ collection }: { collection: SeoCollection }) {
  const pages = getSeoPages(collection);
  const topics = (Object.keys(seoTopics) as SeoTopic[]).filter((topic) => pages.some((page) => page.topic === topic));
  let offset = 0;
  return (
    <>
      {topics.map((topic) => {
        const group = pages.filter((page) => page.topic === topic);
        const visual = topicVisuals[topic];
        const start = offset;
        offset += group.length;
        return (
          <section id={topic} className={styles.group} aria-labelledby={`${topic}-title`} key={topic}>
            <div className={shell.frame}>
              <header className={styles.header}>
                <div className={styles.heading}>
                  <p className={styles.count}>
                    <span className={styles.dot} style={{ background: visual.accent }} aria-hidden="true" />
                    {countLabel(collection, group.length)}
                  </p>
                  <h2 id={`${topic}-title`} className={styles.title}>{seoTopics[topic]}</h2>
                </div>
                <p className={styles.flow}>
                  <span className={styles.flowStep}><Icon name={triggerIcons[topic]} size={16} />{visual.trigger}</span>
                  <span className={styles.flowArrow} aria-hidden="true"><Icon name="arrow-right" size={16} /></span>
                  <span className={shell.srOnly}>, then </span>
                  <span className={`${styles.flowStep} ${styles.flowDone}`}><Icon name="sparkle" size={16} />{visual.sent}</span>
                </p>
              </header>
              <SeoPageCardList pages={group} offset={start} variant="hub" />
            </div>
          </section>
        );
      })}
    </>
  );
}
