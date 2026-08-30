import Link from "next/link";
import { FacebookGlyph } from "../facebook-glyph";
import { InstagramGlyph } from "../instagram-glyph";
import { Reveal } from "./reveal";
import styles from "./channel-showcase.module.css";

const channels = [
  {
    id: "instagram",
    name: "Instagram",
    eyebrow: "Private conversations",
    body: "Start private replies, direct messages, and follow-gated campaigns from real audience signals.",
    icon: <InstagramGlyph size={38} brand />,
  },
  {
    id: "facebook",
    name: "Facebook Pages",
    eyebrow: "Public conversations",
    body: "Send public replies to top-level Page comments while ignoring Page-authored and nested replies.",
    icon: <FacebookGlyph size={38} brand />,
  },
] as const;

export function ChannelShowcase() {
  return (
    <Reveal
      as="section"
      id="channels"
      className={styles.section}
      aria-labelledby="channels-title"
      data-reduced-motion-state="visible"
    >
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.frame}>
        <header className={styles.header}>
          <p>Supported channels</p>
          <h2 id="channels-title">Everywhere your audience is</h2>
          <span>One workspace, with each channel handled on its own terms.</span>
        </header>
        <div className={styles.cards}>
          {channels.map((channel, index) => (
            <article className={styles.card} key={channel.id} data-channel={channel.id}>
              <div className={styles.cardTop}>
                <span className={styles.number}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.icon} aria-hidden="true">{channel.icon}</span>
              </div>
              <p className={styles.eyebrow}>{channel.eyebrow}</p>
              <h3>{channel.name}</h3>
              <p className={styles.body}>{channel.body}</p>
              <Link href="/#surfaces">Explore workflows <span aria-hidden="true">&#8594;</span></Link>
            </article>
          ))}
        </div>
      </div>
    </Reveal>
  );
}
