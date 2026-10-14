import { Fragment, type ReactNode } from "react";
import type { SeoPage } from "@/src/content/seo";
import type { ContentBlock } from "@/src/content/seo/types";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import { StepsActions } from "./actions";
import { stepsHeader } from "./copy";
import styles from "./timeline.module.css";
import { stepVisuals } from "./visuals";

/* Hub guidance has no step kinds: its panels cycle yellow, lilac and the page's accent tint. */
const fallbackTones = ["yellow", "lilac", "accent"] as const;

/**
 * A vertical run of numbered steps on a connector line, each with an optional
 * mini UI panel under its copy. `tones` colours each panel (How it works passes
 * each step's chip tone, so the panels match the legend); without it the
 * panels cycle yellow, lilac and the accent tint. Hub guidance reuses it with
 * its own visuals.
 */
export function StepTimeline({ items, visuals = [], tones, headingLevel = 3 }: {
  items: readonly ContentBlock[]; visuals?: readonly ReactNode[]; tones?: readonly string[]; headingLevel?: 2 | 3 | 4;
}) {
  const Heading = `h${headingLevel}` as "h2" | "h3" | "h4";
  return (
    <ol className={styles.timeline}>
      {items.map(([title, body], index) => (
        <li className={styles.item} key={`${index}-${title}`}>
          <span className={styles.numeral} aria-hidden="true">{index + 1}</span>
          <div className={styles.content}>
            <Heading className={shell.h3}>{title}</Heading>
            <p className={`${shell.body} ${styles.body}`}>{body}</p>
            {visuals[index] ? <div className={styles.visual} data-tone={tones?.[index] ?? fallbackTones[index % fallbackTones.length]} aria-hidden="true">{visuals[index]}</div> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** How it works as a sticky header beside a vertical timeline of setup steps. */
export function StepsTimeline({ page }: { page: SeoPage }) {
  const header = stepsHeader(page);
  const visuals = stepVisuals(page);
  return (
    <section className={`${shell.section} ${shell.band} ${styles.section}`} id="how-it-works" aria-labelledby="workflow-title">
      <div className={`${shell.frame} ${styles.layout}`}>
        <header className={styles.head}>
          <p className={shell.monoPill}>{header.eyebrow}</p>
          <h2 id="workflow-title" className={shell.h2}>{header.title}</h2>
          <p className={shell.sub}>{header.sub}</p>
          {/* The setup in one line: what each step configures. Each arrow travels with the chip after it, so a wrap never strands an arrow at a line end. */}
          <p className={styles.chain} aria-hidden="true">
            {visuals.map((visual, index) => (
              <span key={`${visual.kind}-${index}`} className={styles.chainStep}>
                {index > 0 ? <Icon name="arrow-right" size={16} className={styles.chainArrow} /> : null}
                <span className={styles.chainChip} data-tone={visual.tone}>{visual.chip}</span>
              </span>
            ))}
          </p>
          <StepsActions page={page} />
        </header>
        <StepTimeline
          items={page.steps}
          tones={visuals.map((visual) => visual.tone)}
          visuals={visuals.map((visual, index) => (
            <Fragment key={`${visual.kind}-${index}`}>
              <span className={styles.chip}>{visual.chip}</span>
              <div className={styles.ui}>{visual.body}</div>
            </Fragment>
          ))}
        />
      </div>
    </section>
  );
}
