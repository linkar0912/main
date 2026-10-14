/** Manychat's speech-bubble sticker, in Linkar yellow. Decorative. */
export function FaqSticker({ className }: { className?: string }) {
  return (
    <svg className={className} width="68" height="64" viewBox="0 0 68 64" aria-hidden="true" focusable="false">
      <path d="M12 4h44a9 9 0 0 1 9 9v27a9 9 0 0 1-9 9H33L18 61l2.5-12H12a9 9 0 0 1-9-9V13a9 9 0 0 1 9-9Z" fill="#fff100" />
      <circle cx="25" cy="22" r="3.4" fill="#101116" />
      <circle cx="43" cy="22" r="3.4" fill="#101116" />
      <path d="M24 31c2.8 3.6 6.1 5.4 10 5.4s7.2-1.8 10-5.4" fill="none" stroke="#101116" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
