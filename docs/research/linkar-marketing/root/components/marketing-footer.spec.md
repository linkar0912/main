# MarketingFooter implementation contract

## Target paths

- TSX: `src/components/marketing/marketing-footer.tsx`
- CSS: `src/components/marketing/marketing-footer.module.css`
- Test: `src/components/marketing/marketing-footer.test.tsx`

The footer is a server component. It uses only internal routes that already exist.

## Original Linkar copy and destinations

- Brand line: “Linkar keeps repeatable conversations moving and makes human attention count.”
- Product: “Product” → `/#product`; “How it works” → `/#how-it-works`; “Workflows” → `/#workflows`; “Get started” → `/signup`
- Resources: “Help” → `/help`; “Support” → `/support`; “Login” → `/login`; “Dashboard” → `/dashboard`
- Company: “Linkar home” → `/#top`; “Setup” → `/#setup`; “Questions” → `/#faq`
- Legal: “Privacy” → `/privacy`; “Terms” → `/terms`; “Data deletion” → `/data-deletion`
- Disclaimer: “Linkar uses supported platform interfaces. Availability and messaging limits depend on the connected account and platform policies.”
- Copyright: rendered from the current year as “© {year} Linkar.”
- Final visual wordmark: “LINKAR”

No social profile, press mention, office, team identity, or company-history claim is invented.

## Semantic DOM hierarchy

```text
footer#resources
└─ div (content frame)
   ├─ div (brand block)
   │  ├─ a[aria-label="Linkar home"] (mark + text)
   │  └─ p (brand line)
   ├─ nav[aria-label="Footer"]
   │  └─ div × 4
   │     ├─ h2 (column heading)
   │     └─ ul > li > a
   ├─ div (legal line)
   │  ├─ p (copyright)
   │  └─ p (disclaimer)
   └─ p[aria-hidden="true"] (oversized visual wordmark)
```

Footer column headings are real headings following the page outline but can be visually small.

## Exact layout

- Desktop `>= 1024px`: Ink footer, minimum height `900px`; padding `96px clamp(32px, 4.45vw, 72px) 24px`; top grid is 12 columns. Brand spans `1–4`; four nav columns span `6–12`; column gap `36px`; legal line sits above the final wordmark with margin-top `120px`; wordmark fills the viewport width, font size `clamp(9rem, 22vw, 22rem)`, line-height `0.72`, centered and clipped only at the bottom.
- Tablet `768px–1023px`: padding `88px 32px 20px`; brand spans all 8 columns; nav becomes four equal columns below with margin-top `64px`; legal line stacks at `88px`; wordmark size `clamp(7rem, 21vw, 13rem)`.
- Mobile `<= 767px`: padding `72px 20px 16px`; brand max width `32ch`; nav is a two-column grid with `48px 20px` gaps and margin-top `56px`; link rows minimum `44px`; legal copy stacks with `20px` gap and margin-top `72px`; wordmark margin-top `64px`, size `clamp(5.25rem, 26vw, 8rem)`, letter spacing `-0.07em`.

## Visual values

- Ink `#050505` surface, Canvas `#ffffff` primary type, Canvas at `58%` secondary type.
- Hover/focus links use Volt `#fff100`; “Get started” may use Signal magenta `#fa0cf7` text only.
- Column headings use `--font-mono`, `0.72rem`, uppercase, letter spacing `0.08em`; links/body use `--font-sans`; wordmark uses `--font-display`, weight `900`.
- Top and legal separators use `1px` Canvas at `18%`.

## State transitions

Links change color over `220ms`. The oversized wordmark uses the shared one-time intersection reveal from `translateY(48px)` and opacity `0.35` over `700ms cubic-bezier(.22,.61,.21,1)`. There is no client state.

## Assets

- Text wordmark only; there is no icon mark.
- No raster media. No external URL, social logo, imported brand asset, or remote reference is allowed.

## Focus behavior

Every link has a visible `2px` Volt ring with `3px` offset. Link hit areas are at least `44px` high on mobile. The visual wordmark is hidden from assistive technology so it does not duplicate the brand link.

## Reduced motion

Render the wordmark at full opacity and final position. Remove vertical reveal and hover translation; keep immediate color and focus-ring changes.

## Test contract

Assert four named columns, every exact internal destination, current-year copyright, disclaimer, one accessible brand link, visual wordmark hidden from assistive technology, no external links or invented claims, and final-state wordmark under reduced motion.

