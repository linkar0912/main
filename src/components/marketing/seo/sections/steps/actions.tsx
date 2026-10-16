import Link from "next/link";
import type { SeoPage } from "@/src/content/seo";
import { ButtonRoll } from "../../../button-roll";
import { Icon } from "../../mock-ui";
import shell from "../../seo-section.module.css";
import styles from "./actions.module.css";
import { stepsHeader } from "./copy";

/** Primary CTA, then "See plans" or, on recipes, the recipe download. */
export function StepsActions({ page, className }: { page: SeoPage; className?: string }) {
  const { recipeHref } = stepsHeader(page);
  return (
    <div className={[shell.actions, className].filter(Boolean).join(" ")}>
      <a className={shell.primaryAction} href="/signup"><ButtonRoll label="Create your first reply" /></a>
      {recipeHref ? (
        <a className={shell.outlineAction} href={recipeHref} download>
          <span className={styles.download}><Icon name="download" size={18} />Download this recipe</span>
        </a>
      ) : (
        <Link className={shell.outlineAction} href="/pricing">See plans</Link>
      )}
    </div>
  );
}
