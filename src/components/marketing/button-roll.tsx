import styles from "./primitives.module.css";

type ButtonRollProps = {
  label: string;
};

export function ButtonRoll({ label }: ButtonRollProps) {
  return (
    <span className={styles.buttonRoll}>
      <span
        className={`${styles.buttonRollCopy} ${styles.buttonRollCopyPrimary}`}
        aria-hidden="true"
      >
        {label}
      </span>
      <span
        className={`${styles.buttonRollCopy} ${styles.buttonRollCopySecondary}`}
        aria-hidden="true"
      >
        {label}
      </span>
      <span className={styles.visuallyHidden}>{label}</span>
    </span>
  );
}
