import { useId } from "react";

/**
 * Instagram glyph. lucide-react dropped brand icons in v1.x, so the mark is
 * drawn here: the rounded-square camera body, lens, and flash dot. Stroked
 * rather than filled so it inherits currentColor like every other icon.
 *
 * Pass `brand` where Instagram itself is the subject (a connect button, the
 * connection status card) - it strokes the mark in Instagram's real gradient
 * instead of currentColor, so it reads as recognizably Instagram rather than
 * "some pink icon." Everywhere else (inline text mentions, dense lists)
 * currentColor keeps it quiet.
 */
export function InstagramGlyph({ size = 18, brand = false }: { size?: number; brand?: boolean }) {
  const gradientId = useId();
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={brand ? `url(#${gradientId})` : "currentColor"}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      data-brand-logo={brand ? "instagram" : undefined}
      aria-hidden="true"
      focusable="false"
    >
      {brand && (
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FFDC80" />
            <stop offset="30%" stopColor="#F56040" />
            <stop offset="60%" stopColor="#C13584" />
            <stop offset="85%" stopColor="#5851DB" />
            <stop offset="100%" stopColor="#405DE6" />
          </linearGradient>
        </defs>
      )}
      <rect x="2" y="2" width="20" height="20" rx="5.5" />
      <circle cx="12" cy="12" r="4.25" />
      <circle cx="17.6" cy="6.4" r="1.05" fill={brand ? `url(#${gradientId})` : "currentColor"} stroke="none" />
    </svg>
  );
}
