# Plain-Language Product Copy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite Linkar’s customer-facing interface so creators understand what to enter, what Linkar will do, and what happened.

**Architecture:** Centralize repeated customer vocabulary and make template metadata the single source for names, descriptions, and “How it works” steps. Audit customer surfaces in bounded groups while keeping internal API/type names stable.

**Tech Stack:** TypeScript, React, Next.js, Vitest, Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-05-plain-language-product-copy-design.md`

## Global Constraints

- Keep Automations as the navigation category.
- Do not rename database fields, API contracts, source-code types, or exact legal terminology.
- Use sentence case and active voice.
- Buttons name their result; success messages repeat the same verb.
- Technical terms remain allowed in admin diagnostics and source code.

---

### Task 1: Shared vocabulary and copy guard

**Files:**
- Create: `src/lib/product-copy.ts`
- Create: `src/lib/product-copy.test.ts`
- Create: `scripts/check-customer-copy.mjs`
- Create: `scripts/check-customer-copy.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `PRODUCT_NAVIGATION`, `PROVIDER_LABELS`, `STATUS_COPY`, `COMMON_ACTIONS`, and `pnpm check:copy`.

- [ ] Write failing tests for stable labels and scanner fixtures that reject customer JSX containing “automation surface”, “payload”, “recipient”, or “webhook” while allowing `src/components/admin/**`, route code, tests, and legal pages.
- [ ] Run `pnpm vitest run src/lib/product-copy.test.ts scripts/check-customer-copy.test.ts`; expect module-not-found failures.
- [ ] Implement literal typed maps and a Node filesystem scanner over customer-facing component/page files with explicit allowlisted paths; command-line `rg` remains the manual discovery aid, not a runtime dependency.
- [ ] Add `"check:copy": "node scripts/check-customer-copy.mjs"` to package scripts.
- [ ] Run tests; expect PASS.
- [ ] Commit with `git add src/lib/product-copy.ts src/lib/product-copy.test.ts scripts/check-customer-copy.mjs scripts/check-customer-copy.test.ts package.json && git commit -m "test: establish plain-language vocabulary"`.

### Task 2: Template names and gallery descriptions

**Files:**
- Modify: `src/components/template-picker-modal.tsx`
- Modify: `src/components/template-picker-modal.test.tsx`
- Modify: template metadata modules found by `rg -l "follow-gated|comment-link-dm|story-mention-reply|default-reply" src`
- Modify: affected template metadata tests.

**Interfaces:**
- Produces per template: `{ title, description, howItWorks: string[] }` using the exact examples and vocabulary rules in the spec.

- [ ] Add failing tests requiring every template to have a non-empty outcome-first title, one sentence under 140 characters, and 2–5 natural-language steps; assert the four example renames from the spec.
- [ ] Run the template tests; expect failures on technical titles/chains.
- [ ] Rewrite metadata and render “How it works” without arrows or internal event names.
- [ ] Run template tests and `pnpm check:copy`; expect PASS.
- [ ] Commit with `git commit -am "copy: clarify automation templates"`.

### Task 3: Builder and preview language

**Files:**
- Modify: `src/components/automation-builder.tsx`
- Modify: `src/components/automation-builder/trigger-section.tsx`
- Modify: `src/components/automation-builder/action-section.tsx`
- Modify: `src/components/automation-builder/comment-conditions-section.tsx`
- Modify: `src/components/automation-builder/delivery-controls-section.tsx`
- Modify: `src/components/automation-builder/review-section.tsx`
- Modify: associated tests under `src/components/automation-builder*.test.tsx` and `src/components/automation-builder/*.test.tsx`.

**Interfaces:**
- Produces headings “When this happens”, “Linkar will do this”, and field-specific examples; preserves serialized flow definitions.

- [ ] Write failing tests for clear field questions, outcome-based buttons, and absence of customer-facing “trigger”, “action type”, “opt-in”, and “delivery”.
- [ ] Run builder tests; expect copy assertion failures.
- [ ] Rewrite labels/support/error/success text without changing values, schemas, or builder state.
- [ ] Run builder tests and `pnpm check:copy`; expect PASS.
- [ ] Commit with `git commit -am "copy: make the automation builder approachable"`.

### Task 4: Workspace screen audit

**Files:**
- Modify: customer-facing components under `src/components/` for Home, Automations, Quick Automation, Insights, Contacts, Inbox, Settings, Billing, Profile, Help, loading, empty, and error states.
- Modify: their colocated tests.

**Interfaces:**
- Consumes: Task 1 shared vocabulary.
- Produces: consistent action/result language throughout the signed-in app.

- [ ] Generate the current scanner report and turn each match into an exact test assertion in the owning component test.
- [ ] Run those focused tests; expect copy failures.
- [ ] Rewrite one screen group at a time: Home/Automations, Quick Automation/builder handoff, Insights/Contacts/Inbox, Settings/Billing/Profile/Help.
- [ ] After each group run its tests and `pnpm check:copy`; expect PASS before continuing.
- [ ] Commit each screen group separately with `copy:` messages.

### Task 5: Marketing and first-time-user verification

**Files:**
- Modify: `src/components/marketing/marketing-content.ts`
- Modify: affected files under `src/components/marketing/`
- Modify: marketing component tests.
- Create: `e2e/plain-language-journey.spec.ts`

**Interfaces:**
- Produces: outcome-led marketing copy aligned with the app and a first-time-user journey test.

- [ ] Add failing tests for outcome-led hero/setup/gallery language and an E2E journey from Home to choosing a template and understanding each required field.
- [ ] Run marketing tests and the new E2E spec; expect failures against current technical copy.
- [ ] Rewrite content while preserving factual claims, legal links, and CTA destinations.
- [ ] Run `pnpm check:copy && pnpm lint && pnpm typecheck && pnpm test && pnpm playwright test e2e/plain-language-journey.spec.ts e2e/marketing-accessibility.spec.ts`; expect all PASS.
- [ ] Commit with `git add src/components/marketing e2e/plain-language-journey.spec.ts && git commit -m "copy: clarify the marketing journey"`.
