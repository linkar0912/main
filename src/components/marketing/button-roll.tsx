import styles from "./primitives.module.css";

type ButtonRollProps = {
  label: string;
};

export function ButtonRoll({ label }: ButtonRollProps) {
  return (
    <span className={styles.buttonRoll} aria-label={label}>
      <span className={styles.buttonRollCopy} aria-hidden="true">
        {label}
      </span>
      <span className={styles.buttonRollCopy} aria-hidden="true">
        {label}
      </span>
    </span>
  );
}
