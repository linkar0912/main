# Public Marketing Homepage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Linkar a real public marketing homepage at `/`, moving the existing dashboard to `/dashboard`.

**Architecture:** `proxy.ts`'s auth gate stops matching `/`, so it becomes a public Next.js page composed from twelve small, focused marketing components (`src/components/marketing/`). The dashboard's existing `DashboardScreen` moves unchanged to a new `app/dashboard/page.tsx`. Every auth-redirect default that assumed `/` was the authenticated home now points at `/dashboard`.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, existing Volt CSS design tokens (`app/globals.css`), Vitest + Testing Library for unit tests, Playwright for e2e.

**Spec:** `docs/superpowers/specs/2026-08-27-public-marketing-homepage-design.md`

## Global Constraints

- Presentation-layer only — no AI, billing, prisma/worker, or automation-engine changes.
- No manychat.com copy, imagery, logos, or testimonial quotes are reproduced anywhere.
- The "Coming soon" pricing and testimonials sections must stay honestly framed — no invented price tiers, no fabricated quotes or customer names.
- Every new component reuses the existing Volt tokens (`--ink`, `--accent`, `--volt`, `--space-*`, `--radius-*`) and font variables already defined in `app/globals.css` / `app/layout.tsx` — no new design tokens, no new fonts.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm check:branding` must all pass before this plan is considered done.

---

## Task 1: Move the dashboard to `/dashboard` and make `/` public

This is the routing/auth foundation every later task builds on. It must land as one atomic change: you cannot make `/` public without also moving the dashboard off it, and every auth-redirect default that assumes `/` is "the app" has to move in lockstep.

**Files:**
- Modify: `proxy.ts`
- Modify: `src/lib/auth/session.ts:202-206`
- Modify: `src/lib/auth/session.test.ts:133-138`
- Modify: `app/api/auth/login/route.ts:25`
- Modify: `src/components/app-shell.tsx:26,41,208,226`
- Modify: `src/components/app-shell.test.tsx`
- Modify: `src/components/dashboard-screen.test.tsx:8`
- Modify: `src/components/public-page.tsx:17`
- Create: `src/components/public-page.test.tsx`
- Create: `app/dashboard/page.tsx`
- Modify: `app/page.tsx`
- Modify: `e2e/smoke.spec.ts`
- Modify: `e2e/theme-and-preview.spec.ts`
- Modify: `e2e/responsive-visual-system.spec.ts`

**Interfaces:**
- Consumes: `DashboardScreen` from `src/components/dashboard-screen.tsx` (unchanged, just re-homed).
- Produces: `/dashboard` renders `DashboardScreen`; `/` is public and unauthenticated; `safeNextPath(...)` from `src/lib/auth/session.ts` now falls back to `"/dashboard"` instead of `"/"`.

- [ ] **Step 1: Write the failing unit tests**

Update the redirect-sanitizer test in `src/lib/auth/session.test.ts` (replace lines 133-138):

```ts
  it("rejects external and backslash-based post-login redirects", () => {
    expect(safeNextPath("https://evil.example")).toBe("/dashboard");
    expect(safeNextPath("//evil.example")).toBe("/dashboard");
    expect(safeNextPath("/\\evil.example")).toBe("/dashboard");
    expect(safeNextPath("/automations?tab=active")).toBe("/automations?tab=active");
  });
```

Add a new test to `src/components/app-shell.test.tsx` (append inside the existing `describe("AppShell", ...)` block, after the "renders only the Linkar wordmark..." test):

```ts
  it("links the sidebar brand back to the dashboard, not the public marketing page", async () => {
    stubShellFetch();

    render(<AppShell><main>Workspace</main></AppShell>);

    await screen.findByText("Member");
    expect(screen.getByRole("link", { name: "Linkar" })).toHaveAttribute("href", "/dashboard");
  });
```

Create `src/components/public-page.test.tsx`:

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ supportEmail: "support@example.com" }) }));

const { PublicPage } = await import("./public-page");

describe("PublicPage", () => {
  afterEach(cleanup);

  it("sends 'Back to app' to the dashboard, not the public marketing page", () => {
    render(<PublicPage title="Privacy policy" intro="Intro copy.">{null}</PublicPage>);

    expect(screen.getByRole("link", { name: /Back to app/ })).toHaveAttribute("href", "/dashboard");
  });
});
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `pnpm vitest run src/lib/auth/session.test.ts src/components/app-shell.test.tsx src/components/public-page.test.tsx`
Expected: FAIL — `safeNextPath` still returns `"/"`, the sidebar brand link is still `href="/"`, and `public-page.test.tsx` fails to find a `PublicPage` link pointed at `/dashboard`.

- [ ] **Step 3: Implement the routing change**

`proxy.ts` — replace the `matcher` array (keep everything else, including the comment above it, unchanged):

```ts
export const config = {
  // /activity is the per-workspace activity feed, gated like every other
  // authenticated page. New gated routes should be appended here - keep the
  // list aligned with the routes that render <AppShell> in app/.
  matcher: [
    "/dashboard/:path*",
    "/activity/:path*",
    "/automations/:path*",
    "/settings/:path*",
    "/profile/:path*",
    "/help/:path*",
  ],
};
```

`src/lib/auth/session.ts` — change the fallback (lines 202-206):

```ts
export function safeNextPath(value: string | null | undefined): string {
  return value?.startsWith("/") && !value.startsWith("//") && !/[\\\u0000-\u001f]/.test(value)
    ? value
    : "/dashboard";
}
```

`app/api/auth/login/route.ts` — change line 25's fallback:

```ts
  const nextPath = safeNextPath(String(form.get("next") ?? "/dashboard"));
```

`src/components/app-shell.tsx` — four edits:

Line 26, `workspaceNavigation`'s first entry:
```ts
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
```

Line 41, `isActive`'s root special-case:
```ts
  if (href === "/dashboard") return pathname === "/dashboard";
```

Line 208, mobile topbar brand link:
```tsx
        <Link className="brand" href="/dashboard" aria-label={`${PRODUCT_NAME} overview`}>
```

Line 226, sidebar brand link:
```tsx
        <Link className="sidebar-brand" href="/dashboard">
```

`src/components/public-page.tsx` — line 17 only (the brand link on line 16 stays `href="/"`, since it should now go to the public marketing page):

```tsx
        <Link className="back-link" href="/dashboard"><ArrowLeft size={15} /> Back to app</Link>
```

Create `app/dashboard/page.tsx`:

```tsx
import { DashboardScreen } from "@/src/components/dashboard-screen";

export default function DashboardPage() {
  return <DashboardScreen />;
}
```

Replace `app/page.tsx` with a minimal placeholder — Task 14 replaces this with the full assembled `MarketingPage`, but this keeps `/` real and working the moment this task lands:

```tsx
import Link from "next/link";
import { PRODUCT_TAGLINE } from "@/src/lib/branding";

export default function HomePage() {
  return (
    <main style={{ padding: "96px 24px", textAlign: "center" }}>
      <h1>{PRODUCT_TAGLINE}</h1>
      <p>Linkar automates Instagram comments and DMs with a deterministic Trigger → Condition → Action builder.</p>
      <Link className="button button-primary" href="/signup">Get started free</Link>
    </main>
  );
}
```

Update the `usePathname` mock in `src/components/dashboard-screen.test.tsx` (line 8):

```ts
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
```

Update the `usePathname` mock in `src/components/app-shell.test.tsx` (line 5) the same way:

```ts
vi.mock("next/navigation", () => ({ usePathname: () => "/dashboard" }));
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `pnpm vitest run src/lib/auth/session.test.ts src/components/app-shell.test.tsx src/components/public-page.test.tsx src/components/dashboard-screen.test.tsx`
Expected: PASS

Run: `pnpm typecheck`
Expected: PASS (confirms `app/dashboard/page.tsx` and the trimmed `app/page.tsx` compile)

- [ ] **Step 5: Update the e2e specs**

These exercise a real browser against a running server, so they aren't run as part of this task's pass/fail gate the way the vitest suite is — update them now so the suite is consistent, and run `pnpm test:e2e` if your environment can launch Chromium.

In `e2e/smoke.spec.ts`:

Line 7, the unauthenticated-redirect loop — dashboard is gated, not `/`:
```ts
    for (const path of ["/dashboard", "/profile", "/help"]) {
```

Line 25, in `"owner can sign out"`:
```ts
  await page.goto("/dashboard");
```

Line 49, in `"dashboard and automation list are reachable"`:
```ts
  await page.goto("/dashboard");
```

Add a new test right after the `test.describe("unauthenticated visitor", ...)` block (before `test("owner can sign out", ...)`):

```ts
test("marketing homepage is public and links to signup", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Instagram automation, made clear." })).toBeVisible();
  await page.getByRole("link", { name: "Get started free" }).first().click();
  await expect(page).toHaveURL(/\/signup$/);
  await context.close();
});
```

In `e2e/theme-and-preview.spec.ts`:

Line 4, `"sidebar theme toggle switches and persists dark mode"`:
```ts
  await page.goto("/dashboard");
```

Line 20, rename and repoint the quickstart test (it now describes the dashboard, not the public homepage):
```ts
test("dashboard shows ManyChat-style quick-start recipe cards", async ({ page }) => {
  await page.goto("/dashboard");
```

In `e2e/responsive-visual-system.spec.ts`:

Line 4, the shared `routes` array:
```ts
  "/dashboard",
```

Line 121, `"tablet navigation keeps a full-size menu target"`:
```ts
  await page.goto("/dashboard");
```

Line 187, `"desktop chart fills the content field"`:
```ts
  await page.goto("/dashboard");
```

- [ ] **Step 6: Commit**

```bash
git add proxy.ts src/lib/auth/session.ts src/lib/auth/session.test.ts app/api/auth/login/route.ts \
  src/components/app-shell.tsx src/components/app-shell.test.tsx src/components/dashboard-screen.test.tsx \
  src/components/public-page.tsx src/components/public-page.test.tsx app/dashboard/page.tsx app/page.tsx \
  e2e/smoke.spec.ts e2e/theme-and-preview.spec.ts e2e/responsive-visual-system.spec.ts
git commit -m "feat(routing): move dashboard to /dashboard, make / public"
```

---

## Task 2: `MarketingNav`

**Files:**
- Create: `src/components/marketing/marketing-nav.tsx`
- Test: `src/components/marketing/marketing-nav.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `LinkarMark` (`src/components/linkar-mark.tsx`), `PRODUCT_NAME` (`src/lib/branding.ts`).
- Produces: `MarketingNav()` — default-export-free named export, no props.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingNav } from "./marketing-nav";

describe("MarketingNav", () => {
  afterEach(cleanup);

  it("links Get started free to signup and Login to the login page", () => {
    render(<MarketingNav />);

    expect(screen.getByRole("link", { name: "Get started free" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "Login" })).toHaveAttribute("href", "/login");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/marketing-nav.test.tsx`
Expected: FAIL with "Cannot find module './marketing-nav'"

- [ ] **Step 3: Implement**

```tsx
import Link from "next/link";
import { LinkarMark } from "@/src/components/linkar-mark";
import { PRODUCT_NAME } from "@/src/lib/branding";

export function MarketingNav() {
  return (
    <header className="marketing-nav">
      <Link className="marketing-nav-brand" href="/" aria-label={`${PRODUCT_NAME} home`}>
        <LinkarMark size={20} />
        {PRODUCT_NAME}
      </Link>
      <nav className="marketing-nav-links" aria-label="Section navigation">
        <a href="#features">Features</a>
        <a href="#how-it-works">How it works</a>
        <a href="#recipes">Recipes</a>
      </nav>
      <div className="marketing-nav-actions">
        <Link className="text-link" href="/login">Login</Link>
        <Link className="button button-primary button-small" href="/signup">Get started free</Link>
      </div>
    </header>
  );
}
```

Append to `app/globals.css`:

```css
/* ─────────────────────────────────────────────────────────────────────────────
   Public marketing homepage (/) - manychat-inspired section rhythm, built
   entirely from Linkar's own Volt tokens, copy, and product surfaces.
   ───────────────────────────────────────────────────────────────────────────── */
.marketing-page { overflow-x: hidden; }
.marketing-nav { align-items: center; background: var(--white); border-bottom: 1px solid var(--line); display: flex; justify-content: space-between; padding: var(--space-4) var(--space-6); position: sticky; top: 0; z-index: 20; }
.marketing-nav-brand { align-items: center; color: var(--ink); display: inline-flex; font-size: 1.05rem; font-weight: 800; gap: 9px; letter-spacing: -.02em; }
.marketing-nav-links { display: flex; gap: var(--space-5); }
.marketing-nav-links a { color: var(--slate); font-size: .86rem; font-weight: 650; }
.marketing-nav-links a:hover { color: var(--ink); }
.marketing-nav-actions { align-items: center; display: flex; gap: var(--space-3); }
@media (max-width: 860px) { .marketing-nav-links { display: none; } }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/marketing-nav.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/marketing-nav.tsx src/components/marketing/marketing-nav.test.tsx app/globals.css
git commit -m "feat(marketing): add MarketingNav"
```

---

## Task 3: `Hero`

**Files:**
- Create: `src/components/marketing/hero.tsx`
- Test: `src/components/marketing/hero.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `PRODUCT_TAGLINE` (`src/lib/branding.ts`).
- Produces: `Hero()`, no props. Renders the page's only `<h1>`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Hero } from "./hero";

describe("Hero", () => {
  afterEach(cleanup);

  it("headlines the product tagline and links both CTAs", () => {
    render(<Hero />);

    expect(screen.getByRole("heading", { name: "Instagram automation, made clear.", level: 1 })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get started free" })).toHaveAttribute("href", "/signup");
    expect(screen.getByRole("link", { name: "See how it works" })).toHaveAttribute("href", "#how-it-works");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/hero.test.tsx`
Expected: FAIL with "Cannot find module './hero'"

- [ ] **Step 3: Implement**

```tsx
import Link from "next/link";
import { PRODUCT_TAGLINE } from "@/src/lib/branding";

export function Hero() {
  return (
    <section className="marketing-hero">
      <div>
        <h1>{PRODUCT_TAGLINE}</h1>
        <p>
          Build deterministic comment and DM automations with a guided Trigger → Condition → Action
          builder — powered by Meta&apos;s official Instagram APIs. No AI black box, no scraping, no
          bulk DMs.
        </p>
        <div className="marketing-hero-ctas">
          <Link className="button button-primary" href="/signup">Get started free</Link>
          <a className="button button-secondary" href="#how-it-works">See how it works</a>
        </div>
      </div>
      <div className="marketing-hero-mock" aria-hidden="true">
        <div className="marketing-mock-bubble is-comment">mia_creates: price??</div>
        <div className="marketing-mock-arrow">↓</div>
        <div className="marketing-mock-bubble is-reply">Hey Mia! Here&apos;s our latest price list → linkar.app/p/xyz</div>
      </div>
    </section>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-hero { align-items: center; display: grid; gap: var(--space-7); grid-template-columns: 1.1fr .9fr; margin: 0 auto; max-width: 1180px; padding: var(--space-8) var(--space-6) var(--space-7); }
.marketing-hero h1 { font-size: clamp(2.2rem, 4.5vw, 3.4rem); }
.marketing-hero p { color: var(--slate); font-size: 1.02rem; line-height: 1.6; max-width: 520px; }
.marketing-hero-ctas { display: flex; flex-wrap: wrap; gap: var(--space-3); margin-top: var(--space-5); }
.marketing-hero-mock { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); display: grid; gap: var(--space-3); padding: var(--space-5); }
.marketing-mock-bubble { border-radius: var(--radius-md); font-size: .86rem; padding: var(--space-3) var(--space-4); }
.marketing-mock-bubble.is-comment { align-self: flex-start; background: var(--surface-soft); color: var(--ink); }
.marketing-mock-bubble.is-reply { align-self: flex-end; background: var(--ink); color: var(--white); }
.marketing-mock-arrow { color: var(--subtle); justify-self: center; }
@media (max-width: 860px) { .marketing-hero { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/hero.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/hero.tsx src/components/marketing/hero.test.tsx app/globals.css
git commit -m "feat(marketing): add Hero"
```

---

## Task 4: `TrustStrip`

**Files:**
- Create: `src/components/marketing/trust-strip.tsx`
- Test: `src/components/marketing/trust-strip.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `BadgeCheck`, `Eye`, `Lock` from `lucide-react`.
- Produces: `TrustStrip()`, no props.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TrustStrip } from "./trust-strip";

describe("TrustStrip", () => {
  afterEach(cleanup);

  it("shows the three real trust badges, not fabricated customer logos", () => {
    render(<TrustStrip />);

    expect(screen.getByText("Official Meta Instagram API")).toBeTruthy();
    expect(screen.getByText("AES-256 encrypted tokens")).toBeTruthy();
    expect(screen.getByText("No AI black box")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/trust-strip.test.tsx`
Expected: FAIL with "Cannot find module './trust-strip'"

- [ ] **Step 3: Implement**

```tsx
import { BadgeCheck, Eye, Lock } from "lucide-react";

const TRUST_ITEMS = [
  { icon: BadgeCheck, label: "Official Meta Instagram API" },
  { icon: Lock, label: "AES-256 encrypted tokens" },
  { icon: Eye, label: "No AI black box" },
];

export function TrustStrip() {
  return (
    <div className="marketing-trust-strip">
      {TRUST_ITEMS.map(({ icon: Icon, label }) => (
        <span key={label} className="marketing-trust-item">
          <Icon size={16} strokeWidth={2} />
          {label}
        </span>
      ))}
    </div>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-trust-strip { background: var(--surface-soft); border-bottom: 1px solid var(--line); border-top: 1px solid var(--line); display: flex; flex-wrap: wrap; gap: var(--space-6); justify-content: center; padding: var(--space-5) var(--space-6); }
.marketing-trust-item { align-items: center; color: var(--slate); display: inline-flex; font-size: .82rem; font-weight: 650; gap: 8px; }
.marketing-trust-item svg { color: var(--accent); }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/trust-strip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/trust-strip.tsx src/components/marketing/trust-strip.test.tsx app/globals.css
git commit -m "feat(marketing): add TrustStrip"
```

---

## Task 5: `TriggerTabs`

**Files:**
- Create: `src/components/marketing/trigger-tabs.tsx`
- Test: `src/components/marketing/trigger-tabs.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: React `useState`. Reuses the `.marketing-hero-mock` / `.marketing-mock-bubble` classes from Task 3.
- Produces: `TriggerTabs()`, no props, client component (`"use client"`).

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TriggerTabs } from "./trigger-tabs";

describe("TriggerTabs", () => {
  afterEach(cleanup);

  it("switches the preview when a different trigger tab is selected", () => {
    render(<TriggerTabs />);

    expect(screen.getByText('Comment: "price"')).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "DM triggers" }));

    expect(screen.getByText('DM: "Hi, do you ship to Mumbai?"')).toBeTruthy();
    expect(screen.queryByText('Comment: "price"')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/trigger-tabs.test.tsx`
Expected: FAIL with "Cannot find module './trigger-tabs'"

- [ ] **Step 3: Implement**

```tsx
"use client";

import { useState } from "react";

type Trigger = { id: string; label: string; description: string; commentText: string; replyText: string };

const TRIGGERS: Trigger[] = [
  {
    id: "comment",
    label: "Comment triggers",
    description:
      'A public comment with the right keyword — or any comment — fires a private reply. Perfect for "price?", "link?", or "DM me" comments under your posts and Reels.',
    commentText: 'Comment: "price"',
    replyText: "Private reply sent instantly",
  },
  {
    id: "dm",
    label: "DM triggers",
    description:
      "Any inbound DM, or one matching a keyword, kicks off your flow — including personalization tokens like {username} and {keyword}.",
    commentText: 'DM: "Hi, do you ship to Mumbai?"',
    replyText: 'Auto-reply: "Hey {username}, yes! Here\'s our shipping list."',
  },
  {
    id: "follow-gate",
    label: "Follow-gated campaigns",
    description:
      "Reply to a Reel or post, send a DM asking to follow — then Meta's own follower relationship gates a single private link delivery. No client-side follow checks, no shortcuts.",
    commentText: 'Comment: "guide"',
    replyText: "Link delivered once Meta confirms the follow",
  },
];

export function TriggerTabs() {
  const [activeId, setActiveId] = useState(TRIGGERS[0].id);
  const active = TRIGGERS.find((trigger) => trigger.id === activeId) ?? TRIGGERS[0];

  return (
    <div>
      <div className="marketing-tabs" role="tablist" aria-label="Instagram trigger types">
        {TRIGGERS.map((trigger) => (
          <button
            key={trigger.id}
            type="button"
            role="tab"
            aria-selected={trigger.id === activeId}
            className="marketing-tab"
            onClick={() => setActiveId(trigger.id)}
          >
            {trigger.label}
          </button>
        ))}
      </div>
      <div className="marketing-tab-panel" role="tabpanel">
        <p>{active.description}</p>
        <div className="marketing-hero-mock" aria-hidden="true">
          <div className="marketing-mock-bubble is-comment">{active.commentText}</div>
          <div className="marketing-mock-arrow">↓</div>
          <div className="marketing-mock-bubble is-reply">{active.replyText}</div>
        </div>
      </div>
    </div>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-tabs { display: flex; flex-wrap: wrap; gap: var(--space-2); justify-content: center; margin-bottom: var(--space-6); }
.marketing-tab { background: var(--surface-soft); border: 1px solid transparent; border-radius: 999px; color: var(--slate); font-size: .84rem; font-weight: 700; padding: 10px 18px; }
.marketing-tab[aria-selected="true"] { background: var(--ink); border-color: var(--ink); color: var(--white); }
.marketing-tab-panel { align-items: center; background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-lg); display: grid; gap: var(--space-5); grid-template-columns: 1fr 1fr; padding: var(--space-6); }
.marketing-tab-panel p { color: var(--slate); line-height: 1.6; }
@media (max-width: 860px) { .marketing-tab-panel { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/trigger-tabs.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/trigger-tabs.tsx src/components/marketing/trigger-tabs.test.tsx app/globals.css
git commit -m "feat(marketing): add TriggerTabs"
```

---

## Task 6: `FeatureGrid`

**Files:**
- Create: `src/components/marketing/feature-grid.tsx`
- Test: `src/components/marketing/feature-grid.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `Clock`, `Lightbulb`, `ListChecks`, `Megaphone`, `Sparkles`, `Workflow` from `lucide-react`.
- Produces: `FeatureGrid()`, no props. Renders `<section id="features">` — the target of the nav's `#features` anchor.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FeatureGrid } from "./feature-grid";

describe("FeatureGrid", () => {
  afterEach(cleanup);

  it("renders all six real shipped features under the #features anchor", () => {
    render(<FeatureGrid />);

    expect(document.getElementById("features")).toBeTruthy();
    for (const title of [
      "Guided builder",
      "Personalization tokens",
      "Timed follow-up nudges",
      "Conversational lead forms",
      "Smart keyword suggestions",
      "Win-back broadcasts",
    ]) {
      expect(screen.getByRole("heading", { name: title, level: 3 })).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/feature-grid.test.tsx`
Expected: FAIL with "Cannot find module './feature-grid'"

- [ ] **Step 3: Implement**

```tsx
import { Clock, Lightbulb, ListChecks, Megaphone, Sparkles, Workflow } from "lucide-react";

const FEATURES = [
  { icon: Workflow, title: "Guided builder", description: "A guided Trigger → Condition → Action builder. No code, no flowcharts to reverse-engineer." },
  { icon: Sparkles, title: "Personalization tokens", description: "Drop {username}, {keyword}, and {media} into any reply so every automated message still feels handwritten." },
  { icon: Clock, title: "Timed follow-up nudges", description: "Up to two scheduled nudges per DM flow, respecting opt-outs and Meta's 24-hour messaging window automatically." },
  { icon: ListChecks, title: "Conversational lead forms", description: "Ask up to five questions with typed validation for email, phone, and numbers, with stop-word early exits built in." },
  { icon: Lightbulb, title: "Smart keyword suggestions", description: "The builder suggests proven keywords drawn from your own automations plus battle-tested staples." },
  { icon: Megaphone, title: "Win-back broadcasts", description: "Segment and message contacts who've gone quiet for 7 or 30+ days, right from your workspace." },
];

export function FeatureGrid() {
  return (
    <section id="features" className="marketing-section">
      <div className="marketing-section-head">
        <p className="marketing-eyebrow">Features</p>
        <h2>Everything a deterministic automation needs</h2>
      </div>
      <div className="marketing-feature-grid">
        {FEATURES.map(({ icon: Icon, title, description }) => (
          <div key={title} className="marketing-feature-card">
            <Icon size={22} strokeWidth={1.9} />
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-section { margin: 0 auto; max-width: 1180px; padding: var(--space-8) var(--space-6); }
.marketing-section-head { margin: 0 auto var(--space-6); max-width: 640px; text-align: center; }
.marketing-eyebrow { color: var(--accent); font-size: .72rem; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.marketing-feature-grid { display: grid; gap: var(--space-5); grid-template-columns: repeat(3, minmax(0, 1fr)); }
.marketing-feature-card { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-5); }
.marketing-feature-card svg { color: var(--accent); margin-bottom: var(--space-3); }
.marketing-feature-card p { color: var(--slate); font-size: .86rem; line-height: 1.55; margin: 0; }
@media (max-width: 980px) { .marketing-feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 640px) { .marketing-feature-grid { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/feature-grid.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/feature-grid.tsx src/components/marketing/feature-grid.test.tsx app/globals.css
git commit -m "feat(marketing): add FeatureGrid"
```

---

## Task 7: `HowItWorks`

**Files:**
- Create: `src/components/marketing/how-it-works.tsx`
- Test: `src/components/marketing/how-it-works.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: none.
- Produces: `HowItWorks()`, no props. Renders `<section id="how-it-works">` — the target of the nav's and Hero's `#how-it-works` anchors.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HowItWorks } from "./how-it-works";

describe("HowItWorks", () => {
  afterEach(cleanup);

  it("lists all four steps in order under the #how-it-works anchor", () => {
    render(<HowItWorks />);

    expect(document.getElementById("how-it-works")).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(headings).toEqual(["Pick a trigger", "Add conditions", "Set your reply", "Publish"]);
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/how-it-works.test.tsx`
Expected: FAIL with "Cannot find module './how-it-works'"

- [ ] **Step 3: Implement**

```tsx
const STEPS = [
  { title: "Pick a trigger", description: "A comment keyword, a DM keyword, or any inbound message." },
  { title: "Add conditions", description: "Optionally narrow it by keyword or a specific post or Reel." },
  { title: "Set your reply", description: "Text, link, button, or image-card replies, with personalization tokens built in." },
  { title: "Publish", description: "Linkar listens through Meta's webhook and replies the same way, every time." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="marketing-section">
      <div className="marketing-section-head">
        <p className="marketing-eyebrow">How it works</p>
        <h2>From trigger to reply in four steps</h2>
      </div>
      <div className="marketing-steps">
        {STEPS.map((step) => (
          <div key={step.title} className="marketing-step">
            <h3>{step.title}</h3>
            <p>{step.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-steps { counter-reset: step; display: grid; gap: var(--space-5); grid-template-columns: repeat(4, minmax(0, 1fr)); }
.marketing-step { padding-top: var(--space-6); position: relative; }
.marketing-step::before { align-items: center; background: var(--ink); border-radius: 50%; color: var(--white); content: counter(step); counter-increment: step; display: inline-flex; font-size: .8rem; font-weight: 800; height: 32px; justify-content: center; left: 0; position: absolute; top: 0; width: 32px; }
.marketing-step p { color: var(--slate); font-size: .85rem; line-height: 1.55; margin: 0; }
@media (max-width: 860px) { .marketing-steps { grid-template-columns: 1fr 1fr; } }
@media (max-width: 560px) { .marketing-steps { grid-template-columns: 1fr; } }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/how-it-works.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/how-it-works.tsx src/components/marketing/how-it-works.test.tsx app/globals.css
git commit -m "feat(marketing): add HowItWorks"
```

---

## Task 8: `RecipeShowcase`

**Files:**
- Create: `src/components/marketing/recipe-showcase.tsx`
- Test: `src/components/marketing/recipe-showcase.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: none.
- Produces: `RecipeShowcase()`, no props. Renders `<section id="recipes">` — the target of the nav's `#recipes` anchor.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RecipeShowcase } from "./recipe-showcase";

describe("RecipeShowcase", () => {
  afterEach(cleanup);

  it("shows all seven real India-first recipes under the #recipes anchor", () => {
    render(<RecipeShowcase />);

    expect(document.getElementById("recipes")).toBeTruthy();
    for (const name of [
      "Lead magnet",
      "Price-list responder",
      "Course FAQ",
      "Event registration",
      "Collab intake",
      "Giveaway entries",
      "Offer follow-up",
    ]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/recipe-showcase.test.tsx`
Expected: FAIL with "Cannot find module './recipe-showcase'"

- [ ] **Step 3: Implement**

```tsx
const RECIPES = [
  { name: "Lead magnet", description: 'Turn "send it" comments into an opt-in DM that delivers your freebie.' },
  { name: "Price-list responder", description: 'Answer "price?" comments with your latest price list, automatically.' },
  { name: "Course FAQ", description: "Handle the same five questions about your course without repeating yourself." },
  { name: "Event registration", description: "Collect name, email, and city from DM replies to your event post." },
  { name: "Collab intake", description: "Screen collaboration DMs with a few qualifying questions before you reply." },
  { name: "Giveaway entries", description: "Confirm entries and rules automatically when your giveaway post blows up." },
  { name: "Offer follow-up", description: "Nudge interested DMs who went quiet, twice, on a schedule you control." },
];

export function RecipeShowcase() {
  return (
    <section id="recipes" className="marketing-section">
      <div className="marketing-section-head">
        <p className="marketing-eyebrow">Recipes</p>
        <h2>Seven starting points, built for India-first creators and businesses</h2>
      </div>
      <div className="marketing-recipe-grid">
        {RECIPES.map((recipe) => (
          <div key={recipe.name} className="marketing-recipe-card">
            <strong>{recipe.name}</strong>
            <p>{recipe.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-recipe-grid { display: grid; gap: var(--space-4); grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); }
.marketing-recipe-card { background: var(--surface-soft); border: 1px solid var(--line); border-radius: var(--radius-md); padding: var(--space-4) var(--space-5); }
.marketing-recipe-card strong { display: block; font-size: .94rem; margin-bottom: 4px; }
.marketing-recipe-card p { color: var(--slate); font-size: .82rem; line-height: 1.5; margin: 0; }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/recipe-showcase.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/recipe-showcase.tsx src/components/marketing/recipe-showcase.test.tsx app/globals.css
git commit -m "feat(marketing): add RecipeShowcase"
```

---

## Task 9: `IntegrationsStrip`

**Files:**
- Create: `src/components/marketing/integrations-strip.tsx`
- Test: `src/components/marketing/integrations-strip.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `InstagramGlyph` from `src/components/instagram-glyph.tsx`.
- Produces: `IntegrationsStrip()`, no props.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { IntegrationsStrip } from "./integrations-strip";

describe("IntegrationsStrip", () => {
  afterEach(cleanup);

  it("lists only the two integrations Linkar actually has", () => {
    render(<IntegrationsStrip />);

    expect(screen.getByText("Instagram Business")).toBeTruthy();
    expect(screen.getByText("Meta Business Suite")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/integrations-strip.test.tsx`
Expected: FAIL with "Cannot find module './integrations-strip'"

- [ ] **Step 3: Implement**

```tsx
import { InstagramGlyph } from "@/src/components/instagram-glyph";

export function IntegrationsStrip() {
  return (
    <section className="marketing-section">
      <div className="marketing-section-head">
        <p className="marketing-eyebrow">Integrations</p>
        <h2>Works directly with Meta</h2>
      </div>
      <div className="marketing-integrations">
        <span className="marketing-integration-chip"><InstagramGlyph size={16} brand /> Instagram Business</span>
        <span className="marketing-integration-chip">Meta Business Suite</span>
      </div>
    </section>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-integrations { align-items: center; display: flex; gap: var(--space-4); justify-content: center; }
.marketing-integration-chip { align-items: center; background: var(--surface-soft); border-radius: 999px; display: inline-flex; font-size: .84rem; font-weight: 650; gap: 8px; padding: 9px 16px; }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/integrations-strip.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/integrations-strip.tsx src/components/marketing/integrations-strip.test.tsx app/globals.css
git commit -m "feat(marketing): add IntegrationsStrip"
```

---

## Task 10: `PricingTeaser`

**Files:**
- Create: `src/components/marketing/pricing-teaser.tsx`
- Test: `src/components/marketing/pricing-teaser.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: none.
- Produces: `PricingTeaser()`, no props. Must not render any invented price tier.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PricingTeaser } from "./pricing-teaser";

describe("PricingTeaser", () => {
  afterEach(cleanup);

  it("marks pricing as coming soon and does not show any invented price", () => {
    render(<PricingTeaser />);

    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.queryByText(/\$\d/)).toBeNull();
    expect(screen.queryByText(/₹\d/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/pricing-teaser.test.tsx`
Expected: FAIL with "Cannot find module './pricing-teaser'"

- [ ] **Step 3: Implement**

```tsx
import Link from "next/link";

export function PricingTeaser() {
  return (
    <section className="marketing-section">
      <div className="marketing-placeholder-card">
        <span className="marketing-coming-soon">Coming soon</span>
        <h2>Simple pricing, coming soon</h2>
        <p>Linkar is free during early access — no credit card, no seat limits, while we build the product alongside our first users.</p>
        <Link className="button button-primary" href="/signup">Get started free</Link>
      </div>
    </section>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-coming-soon { background: var(--volt-soft); border-radius: 999px; color: var(--ink); display: inline-block; font-size: .68rem; font-weight: 800; letter-spacing: .06em; margin-bottom: var(--space-3); padding: 4px 10px; text-transform: uppercase; }
.marketing-placeholder-card { background: var(--panel); border: 1px dashed var(--line-strong); border-radius: var(--radius-lg); padding: var(--space-6); text-align: center; }
.marketing-placeholder-card p { color: var(--slate); margin: var(--space-2) auto var(--space-4); max-width: 480px; }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/pricing-teaser.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/pricing-teaser.tsx src/components/marketing/pricing-teaser.test.tsx app/globals.css
git commit -m "feat(marketing): add PricingTeaser"
```

---

## Task 11: `TestimonialsTeaser`

**Files:**
- Create: `src/components/marketing/testimonials-teaser.tsx`
- Test: `src/components/marketing/testimonials-teaser.test.tsx`

**Interfaces:**
- Consumes: none — reuses `.marketing-placeholder-card` / `.marketing-coming-soon` from Task 10, no new CSS needed.
- Produces: `TestimonialsTeaser()`, no props. Must not render any fabricated quote or customer name.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TestimonialsTeaser } from "./testimonials-teaser";

describe("TestimonialsTeaser", () => {
  afterEach(cleanup);

  it("marks testimonials as coming soon instead of showing fabricated quotes", () => {
    render(<TestimonialsTeaser />);

    expect(screen.getByText("Coming soon")).toBeTruthy();
    expect(screen.getByText(/onboarding our first users/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/testimonials-teaser.test.tsx`
Expected: FAIL with "Cannot find module './testimonials-teaser'"

- [ ] **Step 3: Implement**

```tsx
export function TestimonialsTeaser() {
  return (
    <section className="marketing-section">
      <div className="marketing-placeholder-card">
        <span className="marketing-coming-soon">Coming soon</span>
        <h2>Built with early creators and businesses</h2>
        <p>We&apos;re onboarding our first users right now. Their stories will live here soon.</p>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/testimonials-teaser.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/testimonials-teaser.tsx src/components/marketing/testimonials-teaser.test.tsx
git commit -m "feat(marketing): add TestimonialsTeaser"
```

---

## Task 12: `FinalCta`

**Files:**
- Create: `src/components/marketing/final-cta.tsx`
- Test: `src/components/marketing/final-cta.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: none.
- Produces: `FinalCta()`, no props.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FinalCta } from "./final-cta";

describe("FinalCta", () => {
  afterEach(cleanup);

  it("links its CTA to signup", () => {
    render(<FinalCta />);

    expect(screen.getByRole("heading", { name: "Ready to put replies on autopilot?" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Get started free" })).toHaveAttribute("href", "/signup");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/final-cta.test.tsx`
Expected: FAIL with "Cannot find module './final-cta'"

- [ ] **Step 3: Implement**

```tsx
import Link from "next/link";

export function FinalCta() {
  return (
    <section className="marketing-section">
      <div className="marketing-final-cta">
        <h2>Ready to put replies on autopilot?</h2>
        <p>Free to start. Five minutes to your first automation.</p>
        <Link className="button button-primary" href="/signup">Get started free</Link>
      </div>
    </section>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-final-cta { background: var(--ink); border-radius: var(--radius-lg); margin: 0 auto; max-width: 1180px; padding: var(--space-8) var(--space-6); text-align: center; }
.marketing-final-cta h2 { color: var(--white); }
.marketing-final-cta p { color: var(--accent-pale-dark); margin: 0 auto var(--space-5); max-width: 480px; }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/final-cta.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/final-cta.tsx src/components/marketing/final-cta.test.tsx app/globals.css
git commit -m "feat(marketing): add FinalCta"
```

---

## Task 13: `MarketingFooter`

**Files:**
- Create: `src/components/marketing/marketing-footer.tsx`
- Test: `src/components/marketing/marketing-footer.test.tsx`
- Modify: `app/globals.css` (append)

**Interfaces:**
- Consumes: `LinkarMark`, `PRODUCT_NAME`, `PRODUCT_TAGLINE`.
- Produces: `MarketingFooter()`, no props. Every link must point at a real existing route (`/help`, `/support`, `/login`, `/privacy`, `/terms`, `/data-deletion`, or an on-page anchor) — no invented destinations.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingFooter } from "./marketing-footer";

describe("MarketingFooter", () => {
  afterEach(cleanup);

  it("links only to real existing pages", () => {
    render(<MarketingFooter />);

    expect(screen.getByRole("link", { name: "Help" })).toHaveAttribute("href", "/help");
    expect(screen.getByRole("link", { name: "Support" })).toHaveAttribute("href", "/support");
    expect(screen.getByRole("link", { name: "Privacy" })).toHaveAttribute("href", "/privacy");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/terms");
    expect(screen.getByRole("link", { name: "Data deletion" })).toHaveAttribute("href", "/data-deletion");
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/marketing-footer.test.tsx`
Expected: FAIL with "Cannot find module './marketing-footer'"

- [ ] **Step 3: Implement**

```tsx
import Link from "next/link";
import { LinkarMark } from "@/src/components/linkar-mark";
import { PRODUCT_NAME, PRODUCT_TAGLINE } from "@/src/lib/branding";

export function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <div className="marketing-footer-grid">
        <div className="marketing-footer-col marketing-footer-brand">
          <span className="marketing-nav-brand"><LinkarMark size={20} />{PRODUCT_NAME}</span>
          <p>{PRODUCT_TAGLINE}</p>
        </div>
        <div className="marketing-footer-col">
          <h4>Product</h4>
          <ul>
            <li><a href="#features">Features</a></li>
            <li><a href="#how-it-works">How it works</a></li>
            <li><a href="#recipes">Recipes</a></li>
          </ul>
        </div>
        <div className="marketing-footer-col">
          <h4>Support</h4>
          <ul>
            <li><Link href="/help">Help</Link></li>
            <li><Link href="/support">Support</Link></li>
            <li><Link href="/login">Login</Link></li>
          </ul>
        </div>
        <div className="marketing-footer-col">
          <h4>Legal</h4>
          <ul>
            <li><Link href="/privacy">Privacy</Link></li>
            <li><Link href="/terms">Terms</Link></li>
            <li><Link href="/data-deletion">Data deletion</Link></li>
          </ul>
        </div>
      </div>
      <p className="marketing-footer-legal">© 2026 {PRODUCT_NAME}. Not affiliated with Meta or Instagram.</p>
    </footer>
  );
}
```

Append to `app/globals.css`:

```css
.marketing-footer { border-top: 1px solid var(--line); padding: var(--space-8) var(--space-6); }
.marketing-footer-grid { display: grid; gap: var(--space-6); grid-template-columns: 1.4fr repeat(3, 1fr); margin: 0 auto var(--space-6); max-width: 1180px; }
.marketing-footer-col h4 { color: var(--muted); font-size: .72rem; letter-spacing: .06em; margin-bottom: var(--space-3); text-transform: uppercase; }
.marketing-footer-col ul { display: grid; gap: 10px; list-style: none; margin: 0; padding: 0; }
.marketing-footer-col a { color: var(--slate); font-size: .86rem; }
.marketing-footer-col a:hover { color: var(--ink); }
.marketing-footer-brand { align-items: flex-start; display: flex; flex-direction: column; gap: var(--space-3); }
.marketing-footer-legal { color: var(--subtle); font-size: .76rem; margin: 0 auto; max-width: 1180px; }
@media (max-width: 860px) { .marketing-footer-grid { grid-template-columns: 1fr 1fr; } }
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/marketing-footer.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/marketing/marketing-footer.tsx src/components/marketing/marketing-footer.test.tsx app/globals.css
git commit -m "feat(marketing): add MarketingFooter"
```

---

## Task 14: Assemble `MarketingPage`, wire it into `/`, and verify the whole feature

**Files:**
- Create: `src/components/marketing/marketing-page.tsx`
- Test: `src/components/marketing/marketing-page.test.tsx`
- Modify: `app/page.tsx` (replaces the Task 1 placeholder)
- Modify: `e2e/smoke.spec.ts` (extend the marketing homepage test from Task 1)

**Interfaces:**
- Consumes: every component from Tasks 2-13 (`MarketingNav`, `Hero`, `TrustStrip`, `TriggerTabs`, `FeatureGrid`, `HowItWorks`, `RecipeShowcase`, `IntegrationsStrip`, `PricingTeaser`, `TestimonialsTeaser`, `FinalCta`, `MarketingFooter`).
- Produces: `MarketingPage()`, no props — the full public homepage. `app/page.tsx` renders it at `/`.

- [ ] **Step 1: Write the failing test**

```tsx
// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MarketingPage } from "./marketing-page";

describe("MarketingPage", () => {
  afterEach(cleanup);

  it("renders the hero, every section anchor, and a working signup CTA", () => {
    render(<MarketingPage />);

    expect(screen.getByRole("heading", { name: "Instagram automation, made clear.", level: 1 })).toBeTruthy();
    expect(document.getElementById("features")).toBeTruthy();
    expect(document.getElementById("how-it-works")).toBeTruthy();
    expect(document.getElementById("recipes")).toBeTruthy();

    const ctas = screen.getAllByRole("link", { name: "Get started free" });
    expect(ctas.length).toBeGreaterThan(0);
    ctas.forEach((cta) => expect(cta).toHaveAttribute("href", "/signup"));
  });
});
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `pnpm vitest run src/components/marketing/marketing-page.test.tsx`
Expected: FAIL with "Cannot find module './marketing-page'"

- [ ] **Step 3: Implement**

```tsx
import { FeatureGrid } from "./feature-grid";
import { FinalCta } from "./final-cta";
import { Hero } from "./hero";
import { HowItWorks } from "./how-it-works";
import { IntegrationsStrip } from "./integrations-strip";
import { MarketingFooter } from "./marketing-footer";
import { MarketingNav } from "./marketing-nav";
import { PricingTeaser } from "./pricing-teaser";
import { RecipeShowcase } from "./recipe-showcase";
import { TestimonialsTeaser } from "./testimonials-teaser";
import { TriggerTabs } from "./trigger-tabs";
import { TrustStrip } from "./trust-strip";

export function MarketingPage() {
  return (
    <main className="marketing-page">
      <MarketingNav />
      <Hero />
      <TrustStrip />
      <section className="marketing-section">
        <div className="marketing-section-head">
          <p className="marketing-eyebrow">Instagram surfaces</p>
          <h2>Automate the surfaces you already use</h2>
        </div>
        <TriggerTabs />
      </section>
      <FeatureGrid />
      <HowItWorks />
      <RecipeShowcase />
      <IntegrationsStrip />
      <PricingTeaser />
      <TestimonialsTeaser />
      <FinalCta />
      <MarketingFooter />
    </main>
  );
}
```

Replace `app/page.tsx` (the Task 1 placeholder) with:

```tsx
import { MarketingPage } from "@/src/components/marketing/marketing-page";

export default function HomePage() {
  return <MarketingPage />;
}
```

- [ ] **Step 4: Run the test and confirm it passes**

Run: `pnpm vitest run src/components/marketing/marketing-page.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full verification suite**

Run: `pnpm typecheck`
Expected: PASS

Run: `pnpm lint`
Expected: PASS

Run: `pnpm test`
Expected: PASS (every unit test from Tasks 1-14)

Run: `pnpm check:branding`
Expected: PASS ("Branding check passed.")

- [ ] **Step 6: Extend the e2e coverage for the assembled page**

Replace the marketing-homepage test added in Task 1's `e2e/smoke.spec.ts` with a fuller version that exercises the finished page (same test name and position, more assertions):

```ts
test("marketing homepage is public and links to signup", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Instagram automation, made clear." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Everything a deterministic automation needs" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Seven starting points, built for India-first creators and businesses" })).toBeVisible();

  await page.getByRole("tab", { name: "DM triggers" }).click();
  await expect(page.getByText('DM: "Hi, do you ship to Mumbai?"')).toBeVisible();

  await page.getByRole("link", { name: "Get started free" }).first().click();
  await expect(page).toHaveURL(/\/signup$/);
  await context.close();
});
```

Run `pnpm test:e2e` if your environment can launch Chromium; otherwise the assertions above mirror the unit tests already passing in Step 5, so this is a lower-risk gap.

- [ ] **Step 7: Commit**

```bash
git add src/components/marketing/marketing-page.tsx src/components/marketing/marketing-page.test.tsx \
  app/page.tsx e2e/smoke.spec.ts
git commit -m "feat(marketing): assemble MarketingPage and wire it into /"
```
