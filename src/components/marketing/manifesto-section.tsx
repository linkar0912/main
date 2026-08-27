import { Reveal } from "./reveal";
import styles from "./manifesto-section.module.css";

export function ManifestoSection() {
  return (
    <Reveal
      as="section"
      id="product"
      className={styles.section}
      aria-labelledby="manifesto-title"
    >
      <div className={styles.frame}>
        <h2 id="manifesto-title" className={styles.title}>
          The best conversations should keep working after you log off.
        </h2>
        <p className={styles.body}>
          Linkar carries the useful next step forward, then makes room for you when judgment matters.
        </p>
      </div>
    </Reveal>
  );
}
