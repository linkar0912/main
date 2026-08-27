import sharedStyles from "./primitives.module.css";
import styles from "./proof-rail.module.css";

const facts = [
  "Built on the official messaging API",
  "Tokens encrypted at rest",
  "Deterministic flow rules",
  "Follow-ups respect the messaging window",
] as const;

function FactList({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className={styles.facts} aria-hidden={hidden || undefined}>
      {facts.map((fact) => <li key={fact}>{fact}</li>)}
    </ul>
  );
}

export function ProofRail() {
  return (
    <section id="proof" className={styles.section} aria-label="Linkar product facts">
      <h2 className={sharedStyles.visuallyHidden}>Linkar product facts</h2>
      <div className={styles.frame} data-ticker="continuous">
        <div className={styles.track}>
          <FactList />
          <FactList hidden />
        </div>
      </div>
    </section>
  );
}
