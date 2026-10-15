import Link from "next/link";
import { Fragment } from "react";
import type { SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { Icon } from "../../mock-ui";
import { exampleContext, triggerLabel } from "../../seo-example";
import { detailLayout, pageCoin } from "../../seo-layout";
import shell from "../../seo-section.module.css";
import { benefitsEyebrow, benefitsSub, benefitsTitle } from "./copy";
import { outcomeIcons } from "./outcome-visual";
import { benefitOutcomes, type OutcomeKind } from "./outcomes";
import { PanelOutcome } from "./panel-outcome";
import styles from "./iconlist.module.css";

const iconTones = [shell.yellow, shell.lilac, shell.pink] as const;

/** The list item's icon on its tile, so each picture on the panel points back to its benefit. */
function Badge({ kind, index }: { kind: OutcomeKind; index: number }) {
  return <span className={`${styles.badge} ${iconTones[index % iconTones.length]}`}><Icon name={outcomeIcons[kind]} size={18} /></span>;
}

/** The panel's side a step sits on: toward the panel's outer edge, or toward the list. */
type Side = "outer" | "inner";

/*
 * Two ways to draw the automation down the panel, so pages on different
 * contexts do not share one picture. Comments under a post or a Page post
 * cascade from side to side, as replies land under different posts; a Story
 * or a DM conversation runs down one rail, step after step.
 */
type Shape = "cascade" | "rail";

function shapeFor(page: SeoPage): Shape {
  const context = exampleContext(page);
  return context === "post" || context === "page" ? "cascade" : "rail";
}

/*
 * A dashed connector between two steps of the panel's column, from the side
 * the upper step sits on to the side of the lower one. It grows to take the
 * panel's spare height, so the column reads as one automation, top to bottom.
 * On a rail it is a straight line down the rail.
 */
function Connector({ from, to }: { from: Side; to: Side }) {
  const x = { outer: 26, inner: 72 };
  const path = from === to ? `M ${x[from]} 0 L ${x[to]} 100` : `M ${x[from]} 0 C ${x[from]} 55, ${x[to]} 45, ${x[to]} 100`;
  return (
    <span className={styles.connector}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" focusable="false"><path d={path} vectorEffect="non-scaling-stroke" /></svg>
    </span>
  );
}

/**
 * A tall accent panel beside the benefits as an icon list (Manychat brands-06).
 * The panel sums the benefits up as one automation drawn top to bottom: the
 * trigger that starts it, then each later benefit's outcome as a card, and
 * last the first benefit's outcome, floating out over the panel's inner edge.
 * Each card carries its list item's icon tile. A cascade zigzags its cards
 * from side to side (with two benefits it starts on the inner side, so the
 * cards cross the panel corner to corner); a rail stacks them beside one line
 * whose stops are the icon tiles. Where the example already draws a phone, no
 * lock screen is drawn here. The panel side is seeded per page.
 */
export function BenefitsIconlist({ page }: { page: SeoPage }) {
  const outcomes = benefitOutcomes(page);
  const phone = detailLayout(page).example === "phone";
  const shape = shapeFor(page);
  const three = page.benefits.length > 2;
  const triggerSide: Side = shape === "cascade" && !three ? "inner" : "outer";
  const cards = page.benefits.slice(1, 3).map((benefit, offset) => ({
    benefit,
    index: offset + 1,
    side: (shape === "rail" ? "outer" : three && offset === 0 ? "inner" : "outer") as Side,
  }));
  const lastSide = cards.length ? cards[cards.length - 1].side : triggerSide;
  return (
    <section className={`${shell.section} ${shell.band}`} id="benefits" aria-labelledby="benefits-title">
      <div
        className={`${shell.frame} ${styles.layout}`}
        data-media={pageCoin(page, "benefits-iconlist") ? "end" : "start"}
        data-count={page.benefits.length}
      >
        <div className={styles.media}>
          <div className={`${styles.panel} ${shell.accent} ${shell.grid}`} data-shape={shape} aria-hidden="true">
            <span className={styles.trigger} data-place={triggerSide}>
              <span className={styles.triggerIcon}><Icon name="bolt" size={14} /></span>
              <span className={styles.triggerText}>{triggerLabel(page)}</span>
            </span>
            {cards.map(({ benefit, index, side }, offset) => (
              <Fragment key={benefit[0]}>
                <Connector from={offset === 0 ? triggerSide : cards[offset - 1].side} to={side} />
                <div className={styles.card} data-place={side}>
                  <Badge kind={outcomes[index]} index={index} />
                  <div className={styles.cardStage}>
                    <PanelOutcome page={page} kind={outcomes[index]} benefit={benefit} phone={phone} surface="accent" />
                  </div>
                </div>
              </Fragment>
            ))}
            <Connector from={lastSide} to="inner" />
            <div className={styles.float}>
              <Badge kind={outcomes[0]} index={0} />
              <div className={styles.stage}>
                <PanelOutcome page={page} kind={outcomes[0]} benefit={page.benefits[0]} phone={phone} surface="accent" />
              </div>
            </div>
          </div>
        </div>
        <div className={styles.content}>
          <p className={shell.monoPill}>{benefitsEyebrow}</p>
          <h2 id="benefits-title" className={`${shell.h2} ${styles.title}`}>{benefitsTitle(page)}</h2>
          <p className={shell.sub}>{benefitsSub(page.topic)}</p>
          <ul className={styles.list}>
            {page.benefits.map((benefit, index) => (
              <li key={benefit[0]} className={styles.item}>
                <span className={`${styles.icon} ${iconTones[index % iconTones.length]}`} aria-hidden="true">
                  <Icon name={outcomeIcons[outcomes[index]]} size={22} />
                </span>
                <div>
                  <h3 className={styles.itemTitle}>{benefit[0]}</h3>
                  <p className={`${shell.body} ${styles.itemBody}`}>{benefit[1]}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className={shell.actions}>
            <Link className={shell.primaryAction} href="/signup"><ButtonRoll label="Start for free" /></Link>
          </div>
        </div>
      </div>
    </section>
  );
}
