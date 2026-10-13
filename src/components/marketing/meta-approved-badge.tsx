import styles from "./meta-approved-badge.module.css";

/**
 * Trust badge: Linkar passed Meta App Review for the official Instagram API.
 *
 * Deliberately text plus a neutral shield - not Meta's logo, not the blue
 * "Meta Verified" check and not the "Meta Business Partner" badge, which
 * belong to Meta's own programs and must not be used to imply endorsement.
 */
export function MetaApprovedBadge({ tone = "light", className }: { tone?: "light" | "glass"; className?: string }) {
  return (
    <p className={[styles.badge, className].filter(Boolean).join(" ")} data-tone={tone}>
      <svg className={styles.icon} viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
        <path d="M12 2.5 4.5 5.4v5.9c0 4.6 3.1 8.7 7.5 10.2 4.4-1.5 7.5-5.6 7.5-10.2V5.4L12 2.5Z" fill="currentColor" opacity=".16" />
        <path d="M12 2.5 4.5 5.4v5.9c0 4.6 3.1 8.7 7.5 10.2 4.4-1.5 7.5-5.6 7.5-10.2V5.4L12 2.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <path d="m8.6 12.1 2.3 2.3 4.6-4.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>
        <strong>Approved by Meta</strong>
        <span className={styles.dot} aria-hidden="true">·</span>
        Official Instagram API
      </span>
    </p>
  );
}
