# Linkar public marketing homepage

**Date:** 2026-08-27
**Status:** Approved direction
**Scope:** Public route `/`, dashboard relocation to `/dashboard`, auth-redirect defaults

## Purpose

Linkar has no public-facing marketing page today — `/` is middleware-gated straight to `/login` or the authenticated dashboard (`proxy.ts`). This adds a real homepage at `/` that explains the product to a logged-out visitor and drives signups, structured after the section rhythm of category-leading chat-automation marketing sites (manychat.com) but built entirely from Linkar's own copy, features, and Volt design system. No third-party logos, screenshots, or testimonial quotes are reused — where Linkar doesn't yet have the real thing (customer logos, testimonials, pricing tiers), the section is marked "Coming soon" rather than fabricated.

The dashboard moves from `/` to `/dashboard` to make room for the public page. This is a routing/auth change touching the middleware gate and post-login redirect defaults, which is why it's specced rather than done as a quick edit.

## Non-goals

- No billing/pricing logic, no AI, no changes to prisma schema, worker, or automation engine.
- No new authenticated features — this is presentation-layer only.
- No literal reproduction of manychat.com's copy, imagery, logos, or testimonials.

## Routing changes

- `app/page.tsx` becomes the marketing page. The current dashboard content (`DashboardScreen`) moves to a new `app/dashboard/page.tsx`.
- `proxy.ts` matcher: remove `"/"`, add `"/dashboard/:path*"`. `/` becomes public; `/dashboard` stays gated exactly like the other authenticated routes.
- `safeNextPath` (`src/lib/auth/session.ts`) changes its fallback from `"/"` to `"/dashboard"` — once `/` is public, an invalid or missing post-login `next` value should no longer land a signed-in user on the marketing page. `session.test.ts`'s three assertions that expect a `"/"` fallback are updated to expect `"/dashboard"`.
- `app/api/auth/login/route.ts`'s explicit `"/"` fallback for `next` becomes `"/dashboard"`.
- `src/components/app-shell.tsx`: the "Home" nav item, both logo `Link`s, and the `isActive` root special-case (`pathname === "/"`) all move to `/dashboard`.
- `src/components/public-page.tsx`'s "Back to app" link (used by the privacy/terms/support/data-deletion pages) moves to `/dashboard`.
- `app/loading.tsx` (`RootSkeleton`) is already route-neutral (brand mark + spinner, no sidebar) — no change needed, but it will now also serve as the marketing page's Suspense fallback on first load.

## Marketing page composition

New directory `src/components/marketing/`, composed by `app/page.tsx`. Each component is a focused, independently readable unit; the page itself is just the assembly.

1. **`MarketingNav`** — `LinkarMark` + wordmark, anchor links to on-page sections (Features, How it works, Recipes), `Login` link, primary "Get started free" button → `/signup`.
2. **`Hero`** — headline "Instagram automation, made clear" (matches existing site metadata), subhead on the deterministic Trigger → Condition → Action model and official Meta APIs (no AI black box), dual CTA (`Get started free` → `/signup`, `See how it works` → anchor scroll), and an illustrative static mockup of the builder built from existing Volt tokens/icons — not a screenshot.
3. **`TrustStrip`** — three badges: Official Meta Instagram API, AES-256 encrypted tokens, No AI black box. Replaces the customer-logo social-proof strip pattern — Linkar has no public customer logos to show, and inventing them isn't an option.
4. **`TriggerTabs`** — three-tab switcher (Comment triggers / DM triggers / Follow-gated campaigns), each tab showing a short description and small illustrative preview. Mirrors the channel-tab pattern scoped to the Instagram surfaces Linkar actually automates.
5. **`FeatureGrid`** — six cards for real shipped capabilities: guided builder, personalization tokens, timed follow-up nudges, conversational lead forms, smart keyword suggestions, win-back broadcasts.
6. **`HowItWorks`** — four-step visual: Pick a trigger → Add conditions → Set your reply → Publish.
7. **`RecipeShowcase`** — card grid of the seven India-first recipes from the README (lead magnet, price-list responder, course FAQ, event registration, collab intake, giveaway entries, offer follow-up).
8. **`IntegrationsStrip`** — minimal strip: Instagram Business API, Meta Business Suite (the one real integration today).
9. **`PricingTeaser`** — "Coming soon" badge, honest framing (free during early access, no credit card), CTA to sign up. No invented price tiers.
10. **`TestimonialsTeaser`** — "Coming soon" placeholder card ("We're onboarding our first creators and businesses — check back soon"). No fabricated quotes or names.
11. **`FinalCta`** — full-width banner, "Get started free" → `/signup`.
12. **`MarketingFooter`** — link columns to real existing pages only: Product (feature/recipe anchors), Support (`/help`, `/support`), Legal (`/privacy`, `/terms`, `/data-deletion`), plus `Login`.

All components consume the existing `--ink`/`--accent`/`--volt` Volt tokens from `app/globals.css` and the existing `display`/`sans`/`mono` font variables from `app/layout.tsx` — no new design tokens, no new fonts.

## Testing

- Unit: a lightweight render test for the marketing page asserting the key sections and CTAs are present (matching the repo's existing convention of one test per screen-level component, e.g. `dashboard-screen.test.tsx`).
- `session.test.ts`: update the three `safeNextPath` fallback assertions to `/dashboard`.
- `app-shell.test.tsx` / `dashboard-screen.test.tsx`: mocks already set `usePathname` to `"/"` for dashboard-context tests — update to `"/dashboard"` to match the new route.
- e2e (`e2e/smoke.spec.ts`, `e2e/theme-and-preview.spec.ts`, `e2e/responsive-visual-system.spec.ts`): move existing `page.goto("/")` assertions that expect dashboard content (sidebar, "Hello, ...", chart, quickstart recipe cards) to `page.goto("/dashboard")`; add new coverage asserting `/` renders the public marketing page for a logged-out visitor and redirects to it correctly.
- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm check:branding` before considering this done; run the updated e2e specs if the environment supports it.

## Open questions resolved during brainstorming

- **Route for the new page:** replace `/` (not a separate `/home`), dashboard moves to `/dashboard`.
- **Content scope:** full manychat-style section set, with unbuilt features (pricing, testimonials) clearly marked "Coming soon" rather than omitted or faked.
- **Primary CTA:** `/signup`, which already has its own hero copy and flow.
