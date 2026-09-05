# Automation Editing and Mobile Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every automation edit correctly, make state transitions reliable, surface actionable popup errors, and make the complete builder usable on phones.

**Architecture:** Keep the existing versioned definition format and builder split. Move pre-edit snapshots into the repository's update transaction, send the intended final status with each save, add a shared builder notice, and use responsive presentation states for mobile progress, actions, media, and preview.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Prisma/Postgres, Vitest/Testing Library, Playwright, global CSS.

**Spec:** `docs/superpowers/specs/2026-09-05-automation-editing-mobile-design.md`

## Global Constraints

- Preserve existing automation definition versions and Meta delivery behavior.
- Persist snapshots before edits inside a short database transaction.
- All error copy is plain language and appears in a fixed dismissible popup.
- Mobile interactive targets are at least 44px and respect safe-area insets.
- Work locally and complete visual QA before deployment.

---

### Task 1: Atomic automation persistence and version history

**Files:**
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `app/api/automations/[id]/route.ts`
- Test: `app/api/automations/[id]/route.test.ts`
- Test: `src/lib/automation-versions.test.ts`

**Interfaces:**
- `updateAutomation(workspaceId, id, patch, options?: { snapshotBy?: string }): Promise<AutomationRecord | null>`
- A non-empty `snapshotBy` records the pre-update row in the same operation.

- [ ] Add failing tests proving a changed definition is stored and history retains the old definition.
- [ ] Run the focused tests and confirm they fail because Prisma omits `definition` and the route snapshots too late.
- [ ] Persist `definition` explicitly and implement pre-update snapshots in both repositories.
- [ ] Pass `snapshotBy` from PATCH and remove the route's post-update snapshot.
- [ ] Run focused repository and route tests until green.
- [ ] Commit the atomic persistence fix.

### Task 2: Reliable draft and activation semantics

**Files:**
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/automations/[id]/route.ts`
- Modify: `src/components/automation-builder.tsx`
- Test: `app/api/automations/route.test.ts`
- Test: `app/api/automations/[id]/route.test.ts`
- Test: `src/components/automation-builder.test.tsx`

**Interfaces:**
- Creation accepts final `status: "DRAFT" | "ACTIVE"` and sets `activatedAt` when active.
- Existing saves include the intended final status in the same PATCH as the definition.

- [ ] Add failing tests for active-to-draft edits, active edited definitions, and one-request activation.
- [ ] Run focused tests and observe the current mismatched behavior.
- [ ] Extend create input/status persistence and send final status from both builders.
- [ ] Preserve next-media activation and re-arm behavior.
- [ ] Run all automation API and builder tests.
- [ ] Commit state-semantic fixes.

### Task 3: Complete editing controls and popup feedback

**Files:**
- Create: `src/components/action-notice.tsx`
- Create: `src/components/action-notice.test.tsx`
- Modify: `src/components/automation-builder.tsx`
- Modify: `src/components/automation-editor-screen.tsx`
- Modify: `src/lib/validation-error.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/automations/[id]/route.ts`
- Modify: `app/globals.css`
- Test: `src/components/automation-builder.test.tsx`
- Test: `src/components/automation-editor-screen.test.tsx`
- Test: `src/lib/validation-error.test.ts`

**Interfaces:**
- `ActionNotice({ kind, message, onDismiss })` provides fixed alert/status feedback.
- Existing campaigns initialize with all steps unlocked and version-2 priority round-trips.

- [ ] Add failing tests for unlocked edit navigation, priority persistence, popup placement, dismissal, and readable code mapping.
- [ ] Run focused tests and verify the expected failures.
- [ ] Implement the shared notice and structured step validation.
- [ ] Rehydrate/render priority and unlock persisted editors.
- [ ] Replace raw channel errors with corrective human messages.
- [ ] Run focused tests and commit editing/feedback improvements.

### Task 4: Phone-first builder layout and media selection

**Files:**
- Modify: `src/components/automation-builder.tsx`
- Modify: `src/components/media-picker.tsx`
- Modify: `src/components/media-picker.test.tsx`
- Modify: `app/globals.css`
- Test: `src/components/automation-builder.test.tsx`
- Test: `e2e/automation-builder-mobile.spec.ts`

**Interfaces:**
- Mobile preview opens in a labelled modal bottom sheet.
- Mobile wizard exposes current step text and sticky actions without horizontal page overflow.

- [ ] Add failing component tests for preview-sheet open/close and selected Reel accessibility.
- [ ] Add a 390px Playwright flow that selects a Reel and reaches save controls without horizontal overflow.
- [ ] Implement compact mobile progress, safe-area action bar, media rail, and preview sheet.
- [ ] Run component and Playwright tests at 390px and 360px.
- [ ] Commit responsive builder changes.

### Task 5: Verification and local visual QA

**Files:**
- Modify only if QA finds a scoped regression.

- [ ] Run all automation, repository, notice, and media tests.
- [ ] Run the complete `pnpm test`, `pnpm typecheck`, and `pnpm lint` commands.
- [ ] Run `pnpm build`.
- [ ] Start the local app and capture desktop, tablet, 390px, and 360px builder screenshots in light and dark themes.
- [ ] Exercise create draft, activate, reopen, edit, save draft, reactivate, and version restore locally.
- [ ] Fix only observed regressions with a failing test first, then repeat verification.

