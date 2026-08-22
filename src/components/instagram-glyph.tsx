/**
 * Instagram glyph. lucide-react dropped brand icons in v1.x, so the mark is
 * drawn here: the rounded-square camera body, lens, and flash dot. Stroked
 * rather than filled so it inherits currentColor like every other icon.
 */
export function InstagramGlyph({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.6" cy="6.4" r="1.05" fill="currentColor" stroke="none" />
    </svg>
  );
}
