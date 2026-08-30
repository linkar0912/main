# Marketing Navigation and Workspace Settings Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve marketing section spacing, add an accessible Resources mega menu and smooth anchors, and redesign Workspace settings without changing its backend behavior.

**Architecture:** Extend the existing marketing header state machine so Solutions and Resources share one active-menu contract. Keep channel spacing and anchor behavior in marketing CSS. Restructure the existing SettingsScreen presentation around channel-owned health panels and a compact workspace summary while preserving all fetches and action functions.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS Modules, global design tokens, Testing Library, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-marketing-navigation-settings-redesign.md`

## Global Constraints

- Do not deploy.
- Do not add dependencies, backend endpoints, database changes, or Meta permissions.
- Keep all Instagram, Facebook, delivery, team, and policy actions behaviorally unchanged.
- Resources and Solutions must be mutually exclusive and keyboard accessible.
- Smooth scrolling must respect `prefers-reduced-motion`.
- Keep Linkar fonts, colors, dark mode, and responsive behavior.

---

### Task 1: Marketing channel spacing and brand-mark surfaces

**Files:**
- Modify: `src/components/marketing/channel-showcase.module.css`
- Test: `src/components/marketing/marketing-page.test.tsx`

**Interfaces:**
- Consumes: the existing `ChannelShowcase` section with `id="channels"`.
- Produces: responsive white separation before the section and pure-white logo holders for both channels.

- [ ] **Step 1: Run the existing channel characterization test**

Run: `pnpm test src/components/marketing/marketing-page.test.tsx`

Expected: PASS and confirm the existing section content remains characterized. The requested changes are visual CSS decisions and do not earn implementation-detail assertions in jsdom.

- [ ] **Step 2: Implement the CSS**

Give `.section` responsive separation with `margin-block-start: clamp(...)`, while preserving its yellow background. Set `.icon` to `background: #ffffff`. Use smaller separation values at tablet and mobile breakpoints.

- [ ] **Step 3: Run the focused test and visually inspect the section**

Run: `pnpm test src/components/marketing/marketing-page.test.tsx`

Expected: PASS. In local browser inspection, the gap before the yellow surface is white and both logo circles are pure white.

### Task 2: Accessible Resources mega menu

**Files:**
- Modify: `src/components/marketing/marketing-header.tsx`
- Modify: `src/components/marketing/marketing-header.module.css`
- Test: `src/components/marketing/marketing-header.test.tsx`

**Interfaces:**
- Consumes: the existing Solutions trigger, panel, backdrop, keyboard handling, and mobile destinations.
- Produces: `activePanel: "solutions" | "resources" | null`, `marketing-resources`, and a Resources navigation panel.

- [ ] **Step 1: Write failing Resources behavior tests**

Add tests that prove:

```tsx
const resources = screen.getByRole("button", { name: "Resources" });
fireEvent.click(resources);
const panel = screen.getByRole("navigation", { name: "Resources" });
expect(panel.getAttribute("id")).toBe("marketing-resources");
expect(within(panel).getByRole("link", { name: "How it works" }).getAttribute("href")).toBe("/#how-it-works");
expect(within(panel).getByRole("link", { name: "Automation workflows" }).getAttribute("href")).toBe("/#workflows");
expect(within(panel).getByRole("link", { name: "Frequently asked questions" }).getAttribute("href")).toBe("/#faq");
expect(within(panel).getByRole("link", { name: "Help center" }).getAttribute("href")).toBe("/support");
expect(within(panel).getByRole("link", { name: "Privacy policy" }).getAttribute("href")).toBe("/privacy");
expect(within(panel).getByRole("link", { name: "Terms of service" }).getAttribute("href")).toBe("/terms");
expect(within(panel).getByRole("link", { name: "Data deletion" }).getAttribute("href")).toBe("/data-deletion");
```

Add separate tests for mutual exclusion, Escape focus restoration, backdrop close, and resize close.

- [ ] **Step 2: Run the focused tests and confirm the expected failures**

Run: `pnpm test src/components/marketing/marketing-header.test.tsx`

Expected: FAIL because Resources is still a link and no Resources panel exists.

- [ ] **Step 3: Implement one active desktop panel state**

Replace the independent Solutions boolean with:

```tsx
type DesktopPanel = "solutions" | "resources" | null;
const [activePanel, setActivePanel] = useState<DesktopPanel>(null);
```

Use separate trigger refs, one Escape listener, and one resize handler. Opening either panel replaces the other. Render Resources with the approved Learn and Company link groups. Keep mobile resources as ordinary links.

- [ ] **Step 4: Add shared panel styling and Resources-specific link layout**

Reuse the panel, backdrop, entrance animation, focus outline, and reduced-motion rules. Add resource rows with large display-font labels, restrained mono eyebrows, a dividing rule, and responsive desktop sizing.

- [ ] **Step 5: Run focused header tests**

Run: `pnpm test src/components/marketing/marketing-header.test.tsx`

Expected: PASS.

### Task 3: Smooth same-page marketing anchors

**Files:**
- Modify: `src/components/marketing/marketing-page.module.css`
- Modify: `app/globals.css`
- Modify only if missing: marketing section CSS modules containing anchor targets.
- Test: `src/components/marketing/marketing-page.test.tsx`

**Interfaces:**
- Consumes: existing marketing anchor IDs and the fixed 88px header offset.
- Produces: smooth same-page navigation with reduced-motion fallback.

- [ ] **Step 1: Add a failing Resources-to-anchor integration test**

Render the real `MarketingPage`, open its Resources button, read the `href` values for How it works, Automation workflows, and Frequently asked questions, then resolve each hash with `document.querySelector()`. The test fails before implementation because Resources is not a button and its menu does not exist.

- [ ] **Step 2: Run the focused marketing tests**

Run: `pnpm test src/components/marketing/marketing-page.test.tsx src/components/marketing/marketing-header.test.tsx`

Expected: FAIL if any anchor destination is missing or mismatched.

- [ ] **Step 3: Correct anchor destinations and add scrolling CSS**

Add to the document scroll container in `app/globals.css`:

```css
html {
  scroll-behavior: smooth;
  scroll-padding-top: 104px;
}

@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
}
```

Ensure each target section uses an appropriate `scroll-margin-top` for the fixed header.

- [ ] **Step 4: Run focused marketing tests**

Run: `pnpm test src/components/marketing/marketing-page.test.tsx src/components/marketing/marketing-header.test.tsx`

Expected: PASS.

### Task 4: Workspace settings control-center structure

**Files:**
- Modify: `src/components/settings-screen.tsx`
- Modify: `app/globals.css`
- Test: `src/components/settings-screen.test.tsx`

**Interfaces:**
- Consumes: existing settings state, fetches, OAuth URLs, actions, and section values.
- Produces: `settings-summary`, balanced channel cards, channel-owned health blocks, and preserved local tabs.

- [ ] **Step 1: Write failing structural tests**

Add assertions that:

```tsx
expect(screen.getByLabelText("Workspace summary")).toBeTruthy();
expect(screen.getByRole("button", { name: /Connections/ }).getAttribute("aria-pressed")).toBe("true");
const instagramCard = screen.getByText("Instagram connections").closest('[data-channel-card="instagram"]');
const facebookCard = screen.getByText("Facebook Pages").closest('[data-channel-card="facebook"]');
expect(instagramCard?.querySelector('[data-channel-health="instagram"]')).toBeTruthy();
expect(facebookCard?.querySelector('[data-channel-health="facebook"]')).toBeTruthy();
```

Use connected Instagram and Facebook fixtures so both health blocks are present. Add a separate empty-state test proving both channel cards still render without health blocks.

- [ ] **Step 2: Run the focused settings tests and confirm the expected failures**

Run: `pnpm test src/components/settings-screen.test.tsx`

Expected: FAIL because the summary, pressed-state semantics, and integrated health markers do not exist.

- [ ] **Step 3: Restructure SettingsScreen presentation**

Add a compact summary below the page introduction. Add `aria-pressed` to local section buttons. Move each webhook-health block inside its corresponding channel card and mark it with `data-channel-health`. Preserve the Page picker, account lists, connect, reconnect, disconnect, invitation, quiet-hours, and policy handlers unchanged.

- [ ] **Step 4: Redesign settings CSS**

Create a stable two-column channel grid at wide widths, single-column layouts below 1080px, compact responsive connection rows, integrated health dividers, a clearer sticky section rail, and a summary strip. Use existing CSS variables for dark mode and avoid fixed widths that can crush Facebook copy.

- [ ] **Step 5: Run focused settings tests**

Run: `pnpm test src/components/settings-screen.test.tsx`

Expected: PASS.

### Task 5: Regression and production verification

**Files:**
- Modify only if failures reveal an in-scope regression.

**Interfaces:**
- Consumes: Tasks 1 through 4.
- Produces: verified production-ready local changes.

- [ ] **Step 1: Run focused UI tests together**

Run: `pnpm test src/components/marketing/marketing-header.test.tsx src/components/marketing/marketing-page.test.tsx src/components/settings-screen.test.tsx`

Expected: PASS with no warnings.

- [ ] **Step 2: Run the complete suite**

Run: `pnpm test`

Expected: PASS.

- [ ] **Step 3: Run static validation**

Run: `pnpm lint && pnpm typecheck && pnpm check:branding && pnpm check:compose`

Expected: all commands exit 0.

- [ ] **Step 4: Run the production build**

Run: `pnpm build`

Expected: Next.js application and worker builds exit 0.

- [ ] **Step 5: Inspect the final diff**

Run: `git diff --check && git status --short && git diff --stat`

Expected: no whitespace errors and only planned files are modified.
