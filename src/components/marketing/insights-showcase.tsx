import { Reveal } from "./reveal";
import styles from "./insights-showcase.module.css";

/**
 * The one part of the product the homepage never showed: what you get to look at
 * once flows are running. Like the setup and workflow sections, the graphic is a
 * fragment of Linkar's own screens rather than an abstract chart - the two-series
 * day chart, the lifecycle counts, and the tracked-link attribution are all real
 * surfaces. The figures are sample data, the same way the builder and automation
 * previews elsewhere on the page carry sample data; nothing here is presented as
 * a customer result.
 */

/** Fourteen days of sent/reached pairs. Fixed values - a marketing page must render identically every time. */
const days = [
  { day: "18", sent: 9, reached: 6 },
  { day: "19", sent: 14, reached: 11 },
  { day: "20", sent: 11, reached: 8 },
  { day: "21", sent: 19, reached: 14 },
  { day: "22", sent: 24, reached: 18 },
  { day: "23", sent: 17, reached: 13 },
  { day: "24", sent: 12, reached: 9 },
  { day: "25", sent: 26, reached: 20 },
  { day: "26", sent: 31, reached: 24 },
  { day: "27", sent: 22, reached: 17 },
  { day: "28", sent: 28, reached: 21 },
  { day: "29", sent: 35, reached: 27 },
  { day: "30", sent: 30, reached: 23 },
  { day: "31", sent: 38, reached: 29 },
] as const;

const peak = Math.max(...days.map((point) => Math.max(point.sent, point.reached)));

const funnel = [
  { label: "Matched", value: "412" },
  { label: "Replied", value: "388" },
  { label: "Answered", value: "216" },
  { label: "Handed over", value: "34" },
] as const;

const readouts = [
  {
    title: "By day",
    body: "Replies sent and people reached for the last fourteen days, so a quiet week is visible before it becomes a quiet month.",
  },
  {
    title: "By post",
    body: "Which posts and Reels actually start conversations, ranked - not just which ones collected likes.",
  },
  {
    title: "By link",
    body: "Tracked links count total and unique taps and attribute them back to the automation that sent them.",
  },
] as const;

export function InsightsShowcase() {
  return (
    <section id="insights" className={styles.section} aria-labelledby="insights-title">
      <header className={styles.header}>
        <p className={styles.kicker}>Insights</p>
        <h2 id="insights-title">Every reply, accounted for.</h2>
        <p>
          Activity shows each comment, message, and mention as it arrives. Insights show what came
          of it.
        </p>
      </header>

      <div className={styles.layout}>
        <Reveal as="figure" className={styles.panel} aria-label="Linkar insights preview" data-reduced-motion-state="visible">
          <div className={styles.panelHead}>
            <span className={styles.panelLabel}>Last 14 days</span>
            <span className={styles.legend}>
              <span className={styles.legendItem} data-series="sent"><i />Replies sent</span>
              <span className={styles.legendItem} data-series="reached"><i />People reached</span>
            </span>
          </div>

          <div className={styles.chart} aria-hidden="true">
            {days.map((point) => (
              <span className={styles.column} key={point.day}>
                <span className={styles.bars}>
                  <span className={styles.bar} data-series="reached" style={{ blockSize: `${Math.round((point.reached / peak) * 100)}%` }} />
                  <span className={styles.bar} data-series="sent" style={{ blockSize: `${Math.round((point.sent / peak) * 100)}%` }} />
                </span>
                <small>{point.day}</small>
              </span>
            ))}
          </div>

          <dl className={styles.funnel}>
            {funnel.map((step) => (
              <div className={styles.funnelStep} key={step.label}>
                <dt>{step.label}</dt>
                <dd>{step.value}</dd>
              </div>
            ))}
          </dl>

          <div className={styles.linkRow}>
            <span className={styles.linkSlug}>lnk.ar/guide</span>
            <span className={styles.linkStat}><strong>1,284</strong> taps</span>
            <span className={styles.linkStat}><strong>1,012</strong> unique</span>
            <span className={styles.linkAttribution}>Lead magnet from comments</span>
          </div>

          <figcaption className={styles.srOnly}>
            A Linkar insights panel: a fourteen-day chart of replies sent and people reached, participant
            counts by lifecycle state, and a tracked link with its tap count attributed to an automation.
          </figcaption>
        </Reveal>

        <ul className={styles.readouts}>
          {readouts.map((readout, index) => (
            <Reveal as="li" className={styles.readout} key={readout.title} delay={index * 70} data-reduced-motion-state="visible">
              <h3>{readout.title}</h3>
              <p>{readout.body}</p>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  );
}
