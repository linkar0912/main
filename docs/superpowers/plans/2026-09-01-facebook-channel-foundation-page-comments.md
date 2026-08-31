# Facebook Channel Foundation and Page Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly prohibited subagents; execute inline.

**Goal:** Make Facebook Page-comment automation a complete, production-ready Linkar channel while preserving every existing Instagram workflow.

**Architecture:** Introduce an additive provider model and a single capability registry consumed by validation, templates, the builder, simulator, and runners. Refactor the classic builder into channel-aware sections, then expose seven Facebook Page-comment templates and all approved comment controls through the existing Facebook feed runner.

**Tech Stack:** Next.js 16.3.1 App Router, React 19.2.8, TypeScript 5.9.3, Prisma 6.19.3, PostgreSQL, Zod 4.4.3, Vitest 4.1.11, Playwright 1.62.1, BullMQ/Redis, Meta Graph API.

**Spec:** `docs/superpowers/specs/2026-09-01-facebook-automation-parity-design.md`

## Global Constraints

- Before editing App Router pages, layouts, route handlers, or server/client boundaries, read the matching guide under `node_modules/next/dist/docs/`; at minimum read `01-app/01-getting-started/05-server-and-client-components.md`, `01-app/01-getting-started/15-route-handlers.md`, and `01-app/03-api-reference/03-file-conventions/route.md`.
- Follow red-green-refactor. Run the focused failing test before production changes and commit only after it passes.
- Preserve existing Instagram definitions and behavior. Migrations are additive; do not rewrite stored definition JSON or remove the legacy connection columns.
- A new automation must have one explicit provider and one compatible connection pin. Legacy unpinned rows remain editable as Instagram automations.
- Facebook Page comments produce public nested replies only. They never create Messenger contacts or send private messages.
- Campaign definition version 2 remains Instagram-only.
- Never put access tokens, secrets, real customer URLs, Page IDs, or credentials in templates, logs, fixtures, or queue payloads.

---

### Task 1: Add the provider identity to automations

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260901090000_automation_provider/migration.sql`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/automations/[id]/route.ts`
- Test: `src/lib/automation/account-scoping.test.ts`
- Test: `app/api/automations/route.test.ts`

**Interfaces:**
- Produces: `enum AutomationProvider { INSTAGRAM FACEBOOK }`
- Produces: `Automation.provider: AutomationProvider`
- Consumes on new writes: `{ provider, instagramAccountId?, facebookPageId? }`

- [x] **Step 1: Write failing provider and pin tests**

Add cases proving that existing Facebook-pinned records infer `FACEBOOK`, existing Instagram and unpinned records infer `INSTAGRAM`, and new requests reject a missing pin, two pins, or a provider/pin mismatch. Add a compatibility case proving an existing unpinned Instagram record can still update its name.

- [x] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/automation/account-scoping.test.ts app/api/automations/route.test.ts`

Expected: FAIL because `Automation.provider` and provider-aware request validation do not exist.

- [x] **Step 3: Add the enum, deterministic backfill, and constraints**

The migration must add a non-null indexed provider and backfill before applying the default:

```sql
CREATE TYPE "AutomationProvider" AS ENUM ('INSTAGRAM', 'FACEBOOK');
ALTER TABLE "Automation" ADD COLUMN "provider" "AutomationProvider";
UPDATE "Automation"
SET "provider" = CASE WHEN "facebookPageId" IS NOT NULL THEN 'FACEBOOK'::"AutomationProvider"
                      ELSE 'INSTAGRAM'::"AutomationProvider" END;
ALTER TABLE "Automation" ALTER COLUMN "provider" SET NOT NULL;
CREATE INDEX "Automation_workspaceId_provider_idx" ON "Automation"("workspaceId", "provider");
ALTER TABLE "Automation" ADD CONSTRAINT "Automation_provider_pin_check" CHECK (
  ("provider" = 'FACEBOOK' AND "facebookPageId" IS NOT NULL AND "instagramAccountId" IS NULL)
  OR ("provider" = 'INSTAGRAM' AND "facebookPageId" IS NULL)
);
```

Keep the Instagram side permissive for legacy unpinned rows; service validation requires the pin only for new records.

- [x] **Step 4: Make create, update, duplicate, and restore retain provider identity**

Centralize request parsing in `parseAutomationTarget()` and use it in both routes and repository writes. Reject failures with stable code `invalid_channel_target` and HTTP 400.

- [x] **Step 5: Verify and commit**

Run: `pnpm prisma validate && pnpm prisma generate && pnpm vitest run src/lib/automation/account-scoping.test.ts app/api/automations/route.test.ts app/api/automations/[id]/duplicate/route.test.ts && pnpm typecheck`

Expected: all commands exit 0.

```bash
git add prisma src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/automation/account-scoping.test.ts app/api/automations
git commit -m "feat(automation): add provider-aware channel targets"
```

### Task 2: Create the shared capability registry and provider validation

**Files:**
- Create: `src/lib/automation/channels/types.ts`
- Create: `src/lib/automation/channels/registry.ts`
- Create: `src/lib/automation/channels/instagram.ts`
- Create: `src/lib/automation/channels/facebook-page.ts`
- Create: `src/lib/automation/channels/registry.test.ts`
- Modify: `src/lib/automation/definition.ts`
- Modify: `src/lib/automation/simulator.ts`
- Test: `src/lib/automation/definition.test.ts`
- Test: `src/lib/automation/simulator.test.ts`

**Interfaces:**

```ts
export type ChannelTarget = {
  provider: "INSTAGRAM" | "FACEBOOK";
  surface: "COMMENT" | "MESSAGING";
  connectionId: string;
};

export type ChannelCapability = {
  id: "instagram-comment" | "instagram-messaging" | "facebook-page-comment";
  target: Pick<ChannelTarget, "provider" | "surface">;
  triggers: readonly AutomationTrigger["type"][];
  actions: readonly AutomationAction["type"][];
  requiredPermissions: readonly string[];
  connectionKind: "instagram-account" | "facebook-page";
};
```

- [x] **Step 1: Write failing registry consistency tests**

Assert unique capability IDs, valid provider/surface pairs, no Messenger actions in `facebook-page-comment`, required Page permissions `pages_show_list`, `pages_read_engagement`, `pages_read_user_content`, `pages_manage_engagement`, and that every catalog template resolves to one compatible capability.

- [x] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/automation/channels/registry.test.ts`

Expected: FAIL because the registry modules do not exist.

- [x] **Step 3: Implement registry lookup and target derivation**

Export `getChannelCapability(target)`, `deriveAutomationSurface(definition)`, and `validateDefinitionForTarget(definition, target)`. Keep current v1 parsing unchanged first, then apply capability validation as a second pass. Return field-addressable issues rather than throwing generic provider errors.

- [x] **Step 4: Make simulator and API validation consume the registry**

For Facebook Page comments, interpret the existing `private_reply` storage action as the public nested-reply capability only at the adapter boundary. Display and validation language must say “public Page reply”; do not mutate saved Instagram definitions.

- [x] **Step 5: Verify and commit**

Run: `pnpm vitest run src/lib/automation/channels/registry.test.ts src/lib/automation/definition.test.ts src/lib/automation/simulator.test.ts app/api/automations/route.test.ts && pnpm typecheck`

Expected: all focused tests pass.

```bash
git add src/lib/automation/channels src/lib/automation/definition.ts src/lib/automation/definition.test.ts src/lib/automation/simulator.ts src/lib/automation/simulator.test.ts app/api/automations
git commit -m "feat(automation): centralize channel capabilities"
```

### Task 3: Build a provider-aware template catalog

**Files:**
- Modify: `src/lib/automation/templates.ts`
- Create: `src/lib/automation/templates/facebook-page.ts`
- Create: `src/lib/automation/templates/instagram.ts`
- Modify: `src/components/template-picker-modal.tsx`
- Test: `src/lib/automation/templates.test.ts`
- Create: `src/components/template-picker-modal.test.tsx`

**Interfaces:**

```ts
export type AutomationTemplate = {
  id: string;
  provider: "INSTAGRAM" | "FACEBOOK";
  surface: "COMMENT" | "MESSAGING";
  requiredCapabilities: readonly string[];
  category: string;
  definition: AutomationDefinition;
  setup: TemplateSetupDefinition;
};
```

- [ ] **Step 1: Write failing catalog and picker tests**

Require exactly these Facebook Page templates: keyword reply, every-comment reply, product/pricing FAQ, availability/opening hours, giveaway acknowledgement, support acknowledgement, and per-post campaign reply. Assert every one contains a comment trigger and exactly one public Page reply, and that the picker filters by selected provider, surface, and connection capability.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/automation/templates.test.ts src/components/template-picker-modal.test.tsx`

Expected: FAIL because templates have no provider/surface metadata.

- [ ] **Step 3: Split catalogs without changing Instagram IDs or payloads**

Move the current definitions verbatim into `templates/instagram.ts`. Add the seven Facebook definitions with neutral sample copy. Re-export the combined catalog and `getCompatibleTemplates({ provider, surface, capabilities })` from `templates.ts`.

- [ ] **Step 4: Make the picker channel-first**

Render provider, connection, surface, category, and template stages. Changing an established target must present a confirmation listing incompatible trigger/action fields that will be removed; cancel preserves the draft.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run src/lib/automation/templates.test.ts src/components/template-picker-modal.test.tsx src/components/automation-builder.test.tsx && pnpm typecheck`

Expected: all tests pass and existing Instagram snapshots remain unchanged.

```bash
git add src/lib/automation/templates.ts src/lib/automation/templates src/lib/automation/templates.test.ts src/components/template-picker-modal.tsx src/components/template-picker-modal.test.tsx src/components/automation-builder.test.tsx
git commit -m "feat(automation): add Facebook Page templates"
```

### Task 4: Decompose the builder and complete Facebook Page controls

**Files:**
- Modify: `src/components/automation-builder.tsx`
- Create: `src/components/automation-builder/channel-selector.tsx`
- Create: `src/components/automation-builder/trigger-section.tsx`
- Create: `src/components/automation-builder/comment-conditions-section.tsx`
- Create: `src/components/automation-builder/action-section.tsx`
- Create: `src/components/automation-builder/delivery-controls-section.tsx`
- Create: `src/components/automation-builder/review-section.tsx`
- Modify: `src/components/automation-editor-screen.tsx`
- Modify: `src/components/automation-list.tsx`
- Test: `src/components/automation-builder.test.tsx`
- Test: `src/components/automation-list.test.tsx`

- [ ] **Step 1: Add failing Facebook editing tests**

Cover Page selection, post scope, include keywords, exclusion keywords, reply variants, reply-once, schedule, priority, daily limit, public-reply copy, Page preview, explicit target-change confirmation, and persistence of `initialFacebookPageId` when reopening an automation.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/components/automation-builder.test.tsx src/components/automation-list.test.tsx`

Expected: at least the reply-variant, confirmation, and editor rehydration cases fail.

- [ ] **Step 3: Extract sections with characterization tests kept green**

Move one section at a time. Each section receives `{ capability, draft, onChange, errors }`; it must not inspect provider IDs directly. Keep orchestration and save behavior in `automation-builder.tsx`.

- [ ] **Step 4: Finish Page-comment UX**

Expose every approved control, pass `initialFacebookPageId` from `automation-editor-screen.tsx`, label the action “Public Page reply,” and show provider/surface/connection chips in list and review views. Preserve `FacebookPagePreview` as a local-only preview.

- [ ] **Step 5: Verify accessibility and commit**

Run: `pnpm vitest run src/components/automation-builder.test.tsx src/components/automation-list.test.tsx src/lib/automation/templates.test.ts && pnpm typecheck && pnpm lint`

Expected: tests, typecheck, and lint exit 0; keyboard-accessible controls have labels and errors are associated with fields.

```bash
git add src/components/automation-builder.tsx src/components/automation-builder src/components/automation-editor-screen.tsx src/components/automation-list.tsx src/components/automation-builder.test.tsx src/components/automation-list.test.tsx
git commit -m "feat(automation): complete Facebook Page builder"
```

### Task 5: Complete Page-comment runtime semantics

**Files:**
- Modify: `src/lib/facebook/runner.ts`
- Modify: `src/lib/facebook/webhooks.ts`
- Modify: `src/lib/facebook/client.ts`
- Modify: `src/lib/automation/match.ts`
- Modify: `src/lib/automation/runner.ts`
- Test: `src/lib/facebook/runner.test.ts`
- Test: `src/lib/facebook/webhooks.test.ts`
- Test: `src/lib/facebook/client.test.ts`

- [ ] **Step 1: Add failing end-to-end runner cases**

Use signed fixtures to prove post scoping, include/exclude keywords, every-comment mode, deterministic reply-variant selection per comment ID, Page-authored suppression, nested-reply suppression, reply-once, schedule, priority, daily limit, deduplication, and public nested-reply delivery.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/lib/facebook/runner.test.ts src/lib/facebook/webhooks.test.ts src/lib/facebook/client.test.ts`

Expected: reply variants and one or more scope/condition cases fail.

- [ ] **Step 3: Reuse shared policy services and keep delivery provider-specific**

Normalize only top-level visitor comments. Resolve active Page-pinned comment automations, evaluate shared matching/schedule/limits/claims, select a stable variant from `commentId`, then call `FacebookClient.postCommentReply(commentId, text)`. Record the chosen text and provider-safe Graph error code in activity; never record the token.

- [ ] **Step 4: Add stable failure classification**

Map permission drift to `permission_missing`, disconnected Pages to `connection_unhealthy`, and unsupported definitions to `invalid_channel_definition`. A failing Page automation must not affect Instagram jobs.

- [ ] **Step 5: Verify and commit**

Run: `pnpm vitest run src/lib/facebook/runner.test.ts src/lib/facebook/webhooks.test.ts src/lib/facebook/client.test.ts src/lib/automation/runner.test.ts src/lib/automation/match.test.ts && pnpm typecheck`

Expected: all focused tests pass.

```bash
git add src/lib/facebook src/lib/automation/match.ts src/lib/automation/runner.ts src/lib/automation/runner.test.ts src/lib/automation/match.test.ts
git commit -m "feat(facebook): complete Page comment execution"
```

### Task 6: Add Page activity, filtering, help, and production regression gates

**Files:**
- Modify: `app/api/automations/[id]/activity/route.ts`
- Modify: `app/api/automations/deliveries/route.ts`
- Modify: `src/components/automation-activity.tsx`
- Modify: `src/components/automations-screen.tsx`
- Modify: `app/help/page.tsx`
- Modify: `src/components/help-screen.tsx`
- Test: `app/api/automations/[id]/activity/route.test.ts`
- Test: `app/api/automations/deliveries/route.test.ts`
- Test: `src/components/automation-activity.test.tsx`
- Create: `e2e/facebook-page-comment-automation.spec.ts`

- [ ] **Step 1: Write failing provider-filter and activity tests**

Assert provider, surface, and Page filters; public-reply terminology; sanitized Graph error details; and isolation between workspaces and Pages.

- [ ] **Step 2: Implement activity DTOs and UI filters**

Return only provider, surface, connection display name, event type, result, safe error code, timestamps, and reply preview. Add help content explaining that Page comments are public and do not grant Messenger eligibility.

- [ ] **Step 3: Add the Playwright flow**

Create a Page-comment automation from a template, select a Page and post scope, configure keywords and two variants, simulate, save, reopen, activate, and verify the activity rendering with a mocked signed webhook.

- [ ] **Step 4: Run the complete Phase 1 gate**

Run: `pnpm test && pnpm typecheck && pnpm lint && pnpm build && pnpm playwright test e2e/facebook-page-comment-automation.spec.ts`

Expected: every command exits 0. Production smoke configuration still exposes Page comments and contains no Messenger capability.

- [ ] **Step 5: Commit**

```bash
git add app/api/automations src/components/automation-activity.tsx src/components/automation-activity.test.tsx src/components/automations-screen.tsx app/help/page.tsx src/components/help-screen.tsx e2e/facebook-page-comment-automation.spec.ts
git commit -m "test(facebook): verify Page comment product"
```
