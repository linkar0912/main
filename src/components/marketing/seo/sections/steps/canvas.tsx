import type { CSSProperties } from "react";
import type { SeoPage } from "@/src/content/seo";
import { LinkarMark } from "../../../../linkar-mark";
import { Icon, MockNode } from "../../mock-ui";
import { topicVisuals } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import { StepsActions } from "./actions";
import styles from "./canvas.module.css";
import { stepsHeader } from "./copy";
import { stepVisuals } from "./visuals";

/*
 * How it works as Linkar's automation builder: a dark dotted canvas with the
 * steps as connected nodes, and each step's title and copy in a column under
 * its node. Phones stack the nodes, each followed by its copy.
 */
export function StepsCanvas({ page }: { page: SeoPage }) {
  const header = stepsHeader(page);
  const visuals = stepVisuals(page);
  const last = page.steps.length - 1;
  // One column per node, with a connector column between neighbours.
  const columns = { "--steps-columns": `repeat(${last}, minmax(0, 1fr) var(--steps-link)) minmax(0, 1fr)` } as CSSProperties;
  return (
    <section className={`${shell.section} ${shell.canvas} ${styles.section}`} id="how-it-works" aria-labelledby="workflow-title">
      <div className={shell.frame}>
        <header className={shell.headSplit}>
          <div>
            <p className={shell.monoPill}>{header.eyebrow}</p>
            <h2 id="workflow-title" className={shell.h2}>{header.title}</h2>
          </div>
          <div>
            <p className={shell.sub}>{header.sub}</p>
            <StepsActions page={page} />
          </div>
        </header>
        <div className={styles.builder}>
          <div className={styles.toolbar} aria-hidden="true">
            <span className={styles.mark}><LinkarMark size={15} /></span>
            <span className={styles.name}>
              <strong>{page.label}</strong>
              <small>Example automation</small>
            </span>
            <span className={styles.channel}><Icon name={page.topic === "facebook" ? "comment" : "send"} size={14} />{topicVisuals[page.topic].channel}</span>
          </div>
          <ol className={styles.flow} style={columns}>
            {page.steps.map(([title, body], index) => {
              const visual = visuals[index];
              return (
                <li className={styles.step} key={title}>
                  <div className={styles.nodeCell} aria-hidden="true">
                    <MockNode className={styles.node} step={index + 1} type={visual.chip} tone={visual.tone}>{visual.body}</MockNode>
                  </div>
                  {index < last ? <span className={styles.link} aria-hidden="true"><i /><i /></span> : null}
                  <div className={styles.text}>
                    <span className={styles.numeral} aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <h3 className={shell.h3}>{title}</h3>
                    <p className={`${shell.body} ${styles.body}`}>{body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
