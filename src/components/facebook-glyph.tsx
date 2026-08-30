/**
 * Facebook "f" mark. Mirrors InstagramGlyph so a settings page can render
 * a recognisable brand badge for either channel. The "f" is drawn rather
 * than imported because lucide-react dropped brand icons in 1.x.
 */
export function FacebookGlyph({ size = 18, brand = false }: { size?: number; brand?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={brand ? "#1877F2" : "none"}
      stroke={brand ? "none" : "currentColor"}
      strokeWidth={2}
      data-brand-logo={brand ? "facebook" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M13.5 22v-8.5h2.85l.43-3.32H13.5V8.21c0-.96.27-1.61 1.65-1.61h1.76V3.62c-.3-.04-1.35-.13-2.57-.13-2.55 0-4.29 1.55-4.29 4.41v2.28H7.2v3.32h2.85V22h3.45Z"
        fill={brand ? "#1877F2" : "currentColor"}
        stroke="none"
      />
    </svg>
  );
}
