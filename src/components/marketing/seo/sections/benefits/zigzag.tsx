import type { SeoPage } from "@/src/content/seo";
import { Reveal } from "../../../reveal";
import { Icon, MockKeyword, MockStatus } from "../../mock-ui";
import { incomingFor, sentLabel, triggerLabel } from "../../seo-example";
import { pageCoin } from "../../seo-layout";
import { topicVisuals } from "../../seo-theme";
import shell from "../../seo-section.module.css";
import { benefitsEyebrow, benefitsSub, benefitsTitle } from "./copy";
import { benefitOutcomes, destinationFor, type OutcomeKind } from "./outcomes";
import { previewDestination } from "./panel-copy";
import { PanelOutcome } from "./panel-outcome";
import styles from "./zigzag.module.css";

/* Each row's colour panel: the page accent, then yellow, then lilac. */
const panelTones = [["accent", shell.accent], ["yellow", shell.yellow], ["lilac", shell.lilac]] as const;

/*
 * The chip that floats on a row's outcome: the trigger that started it, the
 * word the person typed, the page's status pill, the channel, or (last resort
 * beside a team inbox) the automation standing aside. Each outcome lists the
 * chips that add something it does not already show (a link preview gains the
 * word that asked for it; the routes card already shows its words).
 */
type ChipKind = "trigger" | "keyword" | "status" | "channel" | "paused";

const chipPreference: Record<OutcomeKind, readonly ChipKind[]> = {
  notify: ["status", "trigger", "keyword"],
  preview: ["keyword", "trigger", "channel", "status"],
  caption: ["status", "trigger", "channel"],
  routes: ["trigger", "channel", "status"],
  boundary: ["trigger", "keyword", "status", "channel"],
  menu: ["keyword", "trigger", "status", "channel"],
  contact: ["status", "trigger", "channel"],
  search: ["status", "trigger", "channel"],
  handoff: ["trigger", "keyword", "channel", "status", "paused"],
  pipeline: ["trigger", "keyword", "channel"],
  activity: ["trigger", "keyword", "channel"],
  public: ["trigger", "status", "channel"],
  gate: ["keyword", "trigger", "status", "channel"],
  schedule: ["status", "trigger", "keyword", "channel"],
  optout: ["trigger", "keyword", "channel"],
  retry: ["status", "trigger", "channel"],
};

/**
 * One chip per row, never the same kind twice on a page; a keyword chip only
 * when the person typed one. No "Details saved" pill beside a contact card or
 * search that already shows the saved fields, or beside a handoff, where the
 * person may have left before saving anything: that row can go without a chip.
 * The keyword chip stays off a link card that shows a page other than the
 * keyword's own. "Automation paused" stays off a team page's inbox, which
 * already says so.
 */
function rowChips(page: SeoPage, outcomes: readonly OutcomeKind[]): readonly (ChipKind | null)[] {
  const used = new Set<ChipKind>();
  const hasKeyword = incomingFor(page).keyword !== null;
  const savedPill = /saved/i.test(sentLabel(page));
  const ownPage = destinationFor(page).title;
  return outcomes.map((kind, index) => {
    const repeats = (option: ChipKind) => (option === "status" && savedPill && (kind === "contact" || kind === "search" || kind === "handoff"))
      || (option === "paused" && page.topic === "team");
    // The typed word opens the page's own link, so it never rides on a card showing another page (LOOK on a size chart).
    const otherPage = kind === "preview" && previewDestination(page, page.benefits[index])?.title !== ownPage;
    const keywordFits = hasKeyword && !otherPage;
    const chip = chipPreference[kind].find((option) => !used.has(option) && (option !== "keyword" || keywordFits) && !repeats(option)) ?? null;
    if (chip) used.add(chip);
    return chip;
  });
}

function RowChip({ page, kind, tone }: { page: SeoPage; kind: ChipKind; tone: (typeof panelTones)[number][0] }) {
  if (kind === "keyword") return <MockKeyword className={styles.keyword}>{incomingFor(page).keyword}</MockKeyword>;
  if (kind === "status") return <MockStatus className={styles.status} tone={tone === "yellow" ? "ink" : "yellow"}>{sentLabel(page)}</MockStatus>;
  if (kind === "paused") {
    return (
      <span className={styles.pill}>
        <span className={styles.pillIcon} data-icon="pause"><i /><i /></span>
        <span className={styles.pillText}>Automation paused</span>
      </span>
    );
  }
  if (kind === "trigger") {
    return (
      <span className={styles.pill}>
        <span className={styles.pillIcon}><Icon name="bolt" size={13} /></span>
        <span className={styles.pillText}>{triggerLabel(page)}</span>
      </span>
    );
  }
  const facebook = page.topic === "facebook";
  return (
    <span className={styles.pill}>
      <span className={styles.appTile} data-app={facebook ? "facebook" : "instagram"}>{facebook ? "f" : <Icon name="comment" size={12} />}</span>
      <span className={styles.pillText}>{topicVisuals[page.topic].channel}</span>
    </span>
  );
}

/**
 * One row per benefit: the benefit's outcome, drawn as product UI and scaled
 * up on a flat colour panel, with one supporting chip on its corner, beside a
 * large numbered title. Rows alternate sides; the first side is seeded per page.
 * From tablets up every row takes the tallest row's height, so the panels
 * keep one rhythm when one outcome (a routes card) runs taller than 4:3.
 */
export function BenefitsZigzag({ page }: { page: SeoPage }) {
  const outcomes = benefitOutcomes(page);
  const chips = rowChips(page, outcomes);
  const startEnd = pageCoin(page, "benefits-zigzag");
  const total = String(page.benefits.length).padStart(2, "0");
  return (
    <section className={`${shell.section} ${shell.canvas}`} id="benefits" aria-labelledby="benefits-title">
      <div className={shell.frame}>
        <header className={shell.headSplit}>
          <div>
            <p className={shell.monoPill}>{benefitsEyebrow}</p>
            <h2 id="benefits-title" className={shell.h2}>{benefitsTitle(page)}</h2>
          </div>
          <p className={shell.sub}>{benefitsSub(page.topic)}</p>
        </header>
        <ol className={styles.rows}>
          {page.benefits.map((benefit, index) => {
            const [tone, toneClass] = panelTones[index % panelTones.length];
            const chip = chips[index];
            return (
              <Reveal
                as="li"
                key={benefit[0]}
                className={styles.row}
                data-media={(index % 2 === 0) === startEnd ? "end" : "start"}
              >
                <div className={`${styles.panel} ${toneClass} ${shell.grid}`} data-tone={tone} data-chip={chip ?? "none"} aria-hidden="true">
                  <div className={styles.stage}>
                    <PanelOutcome page={page} kind={outcomes[index]} benefit={benefit} rows={3} head surface={tone === "accent" ? "accent" : "light"} />
                    {chip ? <span className={styles.chip} data-chip={chip} data-on={outcomes[index]}><RowChip page={page} kind={chip} tone={tone} /></span> : null}
                  </div>
                </div>
                <div className={styles.text}>
                  <p className={styles.count} aria-hidden="true"><b>{String(index + 1).padStart(2, "0")}</b><span>/ {total}</span></p>
                  <h3 className={styles.title}>{benefit[0]}</h3>
                  <p className={styles.body}>{benefit[1]}</p>
                </div>
              </Reveal>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
