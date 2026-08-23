/**
 * Linkar brand mark - a rounded chat bubble carrying a lightning bolt:
 * conversations that answer instantly. The bubble inherits currentColor so it
 * adapts to light and dark surfaces; the bolt is always Volt, the signature
 * accent. Brand spots only - use InstagramGlyph where the icon literally means
 * Instagram.
 */
export function LinkarMark({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 2.75c-5.11 0-9.25 3.6-9.25 8.05 0 2.5 1.29 4.73 3.32 6.2-.13 1.56-.89 2.99-1.85 4.01a.45.45 0 0 0 .41.75c2.88-.33 4.91-1.61 5.91-2.39.48.07.96.1 1.46.1 5.11 0 9.25-3.6 9.25-8.06 0-4.45-4.14-8.66-9.25-8.66Z"
        fill="currentColor"
      />
      <path
        d="M13.1 6.9 8.9 12.4h2.8l-1 4.7 4.4-5.9h-2.9l.9-4.3Z"
        fill="var(--volt, #fff100)"
        stroke="var(--volt, #fff100)"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}
