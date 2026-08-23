# Automation Reliability Release 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the security, validation, tenant-integrity, queue-accounting, UI, analytics, and account-ownership corrections that do not depend on the outbound-delivery ledger.

**Architecture:** Preserve the existing Next.js route, repository, runner, and component boundaries while making session validation and tenant scoping consistent at every protected edge. Add database constraints for invariants that application checks alone cannot guarantee, then deploy this independently testable release before introducing delivery-ledger behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Prisma/PostgreSQL 17, BullMQ/Valkey, Vitest/Testing Library, Playwright, Docker Compose, Coolify.

**Spec:** `docs/superpowers/specs/2026-08-23-automation-reliability-audit-design.md`

## Global Constraints

- Before changing Next.js code, read `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`, `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, and `node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md` as required by `AGENTS.md`.
- Keep Release 1 independent of the outbound-delivery ledger and daily-send counter planned for Release 2.
- Every protected route authenticates with `await getValidatedSession(request)` before repository, queue, or provider work.
- Tokens missing either `sid` or `ver` are invalid and require a new login.
- Automation names are trimmed and limited to 120 characters.
- A sequence source is cleared with the explicit JSON value `sourceAutomationId: null`.
- Broadcast job IDs include broadcast, Instagram account, and scoped-user identities.
- Do not merge, reassign, or delete duplicate Instagram-account ownership automatically.
- Do not send real production Instagram messages from automated tests.
- Use failing tests before production changes, keep the worktree clean between tasks, and commit each completed task.

---

### Task 1: Enforce revocation-aware sessions on protected automation surfaces

**Files:**
- Modify: `src/lib/auth/session.ts`
- Modify: `src/lib/auth/session.test.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/automations/[id]/route.ts`
- Modify: `app/api/automations/[id]/activity/route.ts`
- Modify: `app/api/sequences/route.ts`
- Modify: `app/api/sequences/[id]/route.ts`
- Modify: `app/api/broadcasts/route.ts`
- Modify: `app/api/insights/funnels/route.ts`
- Test: `app/api/automations/route.test.ts`
- Test: `app/api/automations/[id]/activity/route.test.ts`
- Create: `app/api/sequences/route.test.ts`
- Create: `app/api/sequences/[id]/route.test.ts`
- Create: `app/api/broadcasts/route.test.ts`
- Create: `app/api/insights/funnels/route.test.ts`

**Interfaces:**
- Consumes: `getValidatedSession(request: Request): Promise<AppSession | null>` and `AutomationRepository.isSessionRevoked/getUserTokenVersion`.
- Produces: `validateSessionState` returns `null` unless `session.sid` and `session.ver` are both present and current; all listed handlers reject with HTTP 401 before side effects.

- [ ] **Step 1: Add failing legacy-token and revoked-session tests**

```ts
it("rejects a signed session without revocation fields", async () => {
  expect(await validateSessionState({ userId: "user_1", workspaceId: "workspace_1", email: "a@b.test" }, repository)).toBeNull();
});

it("does not enqueue a broadcast for a revoked session", async () => {
  mocks.getValidatedSession.mockResolvedValue(null);
  const response = await POST(jsonRequest(validBroadcast));
  expect(response.status).toBe(401);
  expect(mocks.enqueueBroadcastSends).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused tests and confirm the unsafe behavior**

Run: `pnpm vitest run src/lib/auth/session.test.ts app/api/automations/route.test.ts app/api/automations/[id]/activity/route.test.ts app/api/sequences/route.test.ts app/api/sequences/[id]/route.test.ts app/api/broadcasts/route.test.ts app/api/insights/funnels/route.test.ts`

Expected: FAIL because legacy sessions are returned and several routes call `getSessionFromRequest` synchronously.

- [ ] **Step 3: Make the session validator fail closed**

```ts
export async function validateSessionState(
  session: AppSession | null,
  repository: SessionStateRepository,
): Promise<AppSession | null> {
  if (!session?.sid || session.ver === undefined) return null;
  if (await repository.isSessionRevoked(session.sid)) return null;
  const currentVersion = await repository.getUserTokenVersion(session.userId);
  return currentVersion === session.ver ? session : null;
}
```

- [ ] **Step 4: Replace raw session reads in every listed route**

```ts
export async function GET(request: Request) {
  const session = await getValidatedSession(request);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Existing tenant-scoped route behavior follows only after this guard.
}
```

- [ ] **Step 5: Prove rejected mutations have no side effects**

Run: `pnpm vitest run src/lib/auth/session.test.ts app/api/automations/route.test.ts app/api/automations/[id]/activity/route.test.ts app/api/sequences/route.test.ts app/api/sequences/[id]/route.test.ts app/api/broadcasts/route.test.ts app/api/insights/funnels/route.test.ts`

Expected: PASS, including assertions that repository and queue mocks were not called.

- [ ] **Step 6: Commit the session boundary**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts app/api/automations app/api/sequences app/api/broadcasts app/api/insights/funnels
git commit -m "fix: validate sessions across automation routes"
```

### Task 2: Tighten automation definitions and malformed-body handling

**Files:**
- Modify: `src/lib/automation/definition.ts`
- Modify: `src/lib/automation/definition.test.ts`
- Modify: `app/api/automations/route.ts`
- Modify: `app/api/automations/[id]/route.ts`
- Modify: `app/api/automations/route.test.ts`
- Modify: `src/lib/automation/activation-route.test.ts`

**Interfaces:**
- Consumes: `parseFlowDefinition(input: unknown)` and existing POST/PATCH route schemas.
- Produces: normalized V1 trigger invariants, non-empty required V2 follow-gate copy, `name` length 1–120 after trimming, and structured HTTP 400 JSON for invalid JSON.

- [ ] **Step 1: Write failing definition and route tests**

```ts
it.each([
  { type: "message", match: "keyword", keywords: [] },
  { type: "message", match: "any", keywords: ["hello"] },
])("rejects invalid message trigger %#", (trigger) => {
  expect(() => parseFlowDefinition({ ...validV1, trigger })).toThrow();
});

it("requires follow-gate prompt and button copy", () => {
  expect(() => parseFlowDefinition({
    ...validV2,
    followGate: { required: true, notFollowingMessage: "", recheckButtonLabel: "" },
  })).toThrow();
});

it("returns 400 for malformed PATCH JSON", async () => {
  const response = await PATCH(new Request(url, { method: "PATCH", body: "{" }), context);
  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toMatchObject({ error: expect.any(String) });
});
```

- [ ] **Step 2: Verify the tests fail for the audited inputs**

Run: `pnpm vitest run src/lib/automation/definition.test.ts src/lib/automation/activation-route.test.ts app/api/automations/route.test.ts`

Expected: FAIL for message-trigger parity, empty V2 follow-gate fields, long names, or malformed PATCH JSON.

- [ ] **Step 3: Add message-trigger and follow-gate refinements**

```ts
function validateKeywordTrigger(
  trigger: { match: "keyword" | "any"; keywords: string[] },
  context: z.RefinementCtx,
): void {
  if (trigger.match === "keyword" && trigger.keywords.length === 0) {
    context.addIssue({ code: "custom", path: ["trigger", "keywords"], message: "Keyword triggers need at least one keyword" });
  }
  if (trigger.match === "any" && trigger.keywords.length > 0) {
    context.addIssue({ code: "custom", path: ["trigger", "keywords"], message: "Any-message triggers cannot include keywords" });
  }
}
```

Add a V2 `superRefine` that emits issues at `followGate.notFollowingMessage` and `followGate.recheckButtonLabel` when `required` is true and either trimmed string is empty.

- [ ] **Step 4: Centralize request-name and JSON validation**

```ts
const automationNameSchema = z.string().trim().min(1).max(120);

async function readAutomationBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new z.ZodError([{ code: "custom", path: [], message: "Request body must be valid JSON" }]);
  }
}
```

Use `automationNameSchema` in both POST and PATCH and keep all parse failures inside the existing HTTP 400 path.

- [ ] **Step 5: Run definition and route tests**

Run: `pnpm vitest run src/lib/automation/definition.test.ts src/lib/automation/activation-route.test.ts app/api/automations/route.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit validation changes**

```bash
git add src/lib/automation/definition.ts src/lib/automation/definition.test.ts app/api/automations/route.ts app/api/automations/[id]/route.ts app/api/automations/route.test.ts src/lib/automation/activation-route.test.ts
git commit -m "fix: validate automation definitions consistently"
```

### Task 3: Make sequence source clearing and enrollment tenancy explicit

**Files:**
- Modify: `src/lib/automation/sequence.ts`
- Modify: `src/lib/automation/tier2.test.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `src/lib/prisma.test.ts`
- Modify: `src/components/sequences-screen.tsx`
- Create: `src/components/sequences-screen.test.tsx`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260823170000_sequence_tenant_integrity/migration.sql`
- Modify: `src/lib/migration-history.test.ts`

**Interfaces:**
- Consumes: `sequencePatchSchema`, `AutomationRepository.updateSequence`, and `enrollContactInSequence`.
- Produces: `sourceAutomationId?: string | null` for patches; enrollment succeeds only when sequence and contact share `workspaceId`; composite database foreign keys enforce the same invariant.

- [ ] **Step 1: Add failing nullable-source, cross-tenant, and UI payload tests**

```ts
expect(sequencePatchSchema.parse({ sourceAutomationId: null })).toEqual({ sourceAutomationId: null });

await expect(repository.enrollContactInSequence(
  "workspace_a", sequenceInWorkspaceB.id, contactInWorkspaceA.id, 0, now,
)).resolves.toEqual({ created: false });

expect(fetch).toHaveBeenCalledWith("/api/sequences/sequence_1", expect.objectContaining({
  body: expect.stringContaining('"sourceAutomationId":null'),
}));
```

- [ ] **Step 2: Confirm current nullable and tenant tests fail**

Run: `pnpm vitest run src/lib/automation/tier2.test.ts src/lib/repository.test.ts src/lib/prisma.test.ts src/components/sequences-screen.test.tsx app/api/sequences/[id]/route.test.ts`

Expected: FAIL because `null` is rejected/omitted and enrollment does not verify workspace ownership.

- [ ] **Step 3: Change the TypeScript and Zod contracts**

```ts
export const sequencePatchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  status: z.enum(["DRAFT", "ACTIVE", "PAUSED"]).optional(),
  sourceAutomationId: z.string().trim().min(1).nullable().optional(),
  steps: z.array(stepSchema).min(1).max(10).optional(),
});

type SequencePatch = Partial<Pick<AutomationSequenceRecord, "name" | "status" | "steps">> & {
  sourceAutomationId?: string | null;
};
```

- [ ] **Step 4: Implement tenant-consistent repository behavior**

Memory repository: return `{ created: false }` unless both referenced records exist and their `workspaceId` equals the method argument. Prisma repository: query with `{ id, workspaceId }` before create and translate known unique races to `{ created: false }`.

```ts
const [sequence, contact] = await Promise.all([
  prisma.automationSequence.findFirst({ where: { id: sequenceId, workspaceId } }),
  prisma.automationContact.findFirst({ where: { id: contactId, workspaceId } }),
]);
if (!sequence || !contact) return { created: false };
```

- [ ] **Step 5: Add database composite keys and migration SQL**

```sql
CREATE UNIQUE INDEX "AutomationSequence_id_workspaceId_key"
  ON "AutomationSequence"("id", "workspaceId");
CREATE UNIQUE INDEX "AutomationContact_id_workspaceId_key"
  ON "AutomationContact"("id", "workspaceId");
ALTER TABLE "SequenceEnrollment"
  ADD CONSTRAINT "SequenceEnrollment_sequenceId_workspaceId_fkey"
  FOREIGN KEY ("sequenceId", "workspaceId")
  REFERENCES "AutomationSequence"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "SequenceEnrollment_contactId_workspaceId_fkey"
  FOREIGN KEY ("contactId", "workspaceId")
  REFERENCES "AutomationContact"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
```

Update Prisma relations to use `[sequenceId, workspaceId]` and `[contactId, workspaceId]`. Drop the old single-column foreign keys in the migration before adding the composite ones.

- [ ] **Step 6: Send explicit null from the editor**

```ts
const payload = {
  name: name.trim(),
  status,
  sourceAutomationId: sourceAutomationId || null,
  steps: normalizedSteps,
};
```

- [ ] **Step 7: Verify schema, repositories, route, and component**

Run: `pnpm prisma validate && pnpm db:generate && pnpm vitest run src/lib/automation/tier2.test.ts src/lib/repository.test.ts src/lib/prisma.test.ts src/components/sequences-screen.test.tsx app/api/sequences/[id]/route.test.ts src/lib/migration-history.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit sequence integrity**

```bash
git add src/lib/automation/sequence.ts src/lib/automation/tier2.test.ts src/lib/repository.ts src/lib/memory-repository.ts src/lib/prisma.ts src/lib/repository.test.ts src/lib/prisma.test.ts src/components/sequences-screen.tsx src/components/sequences-screen.test.tsx app/api/sequences/[id]/route.test.ts prisma/schema.prisma prisma/migrations/20260823170000_sequence_tenant_integrity src/lib/migration-history.test.ts
git commit -m "fix: enforce sequence tenant integrity"
```

### Task 4: Preserve exact broadcast enqueue accounting

**Files:**
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/queue.test.ts`
- Modify: `app/api/broadcasts/route.ts`
- Modify: `app/api/broadcasts/route.test.ts`

**Interfaces:**
- Consumes: `BroadcastSendJob` and BullMQ `Queue.add`.
- Produces: `BroadcastEnqueueResult = { accepted: BroadcastRecipientKey[]; rejected: BroadcastRecipientKey[] }` and account-aware deterministic job IDs.

- [ ] **Step 1: Add failing collision and partial-enqueue tests**

```ts
it("uses distinct IDs for the same scoped user on two accounts", async () => {
  await enqueueBroadcastSends([jobA, { ...jobA, igAccountId: "ig_account_b" }]);
  expect(queue.add.mock.calls.map((call) => call[2].jobId)).toEqual([
    `broadcast:${jobA.broadcastId}:ig_account_a:${jobA.igScopedUserId}`,
    `broadcast:${jobA.broadcastId}:ig_account_b:${jobA.igScopedUserId}`,
  ]);
});

it("returns the exact rejected recipient after one add fails", async () => {
  queue.add.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("down"));
  await expect(enqueueBroadcastSends([jobA, jobB])).resolves.toEqual({
    accepted: [recipientKey(jobA)], rejected: [recipientKey(jobB)],
  });
});
```

- [ ] **Step 2: Run the queue and route tests to observe the all-or-nothing failure**

Run: `pnpm vitest run src/lib/queue.test.ts app/api/broadcasts/route.test.ts`

Expected: FAIL because job IDs omit `igAccountId` and `Promise.all` rejects without preserving successful adds.

- [ ] **Step 3: Implement settled enqueue results**

```ts
export type BroadcastRecipientKey = Pick<BroadcastSendJob, "igAccountId" | "igScopedUserId">;
export type BroadcastEnqueueResult = {
  accepted: BroadcastRecipientKey[];
  rejected: BroadcastRecipientKey[];
};

const results = await Promise.allSettled(jobs.map((job, index) => queue.add(
  "broadcast-send", job, {
    jobId: `broadcast:${job.broadcastId}:${job.igAccountId}:${job.igScopedUserId}`,
    delay: baseDelayMs + Math.min(index, 600) * 1_000,
    attempts: 2,
    backoff: { type: "fixed", delay: 5_000 },
    removeOnComplete: 500,
    removeOnFail: 1_000,
  },
)));
```

Partition results by index into `accepted` and `rejected`; when no queue is configured, return every job in `rejected`.

- [ ] **Step 4: Count only rejected recipients in the route**

```ts
const enqueueResult = await enqueueBroadcastSends(jobs, quietHoldMs);
if (enqueueResult.rejected.length > 0) {
  await repository.incrementBroadcastCounters(broadcast.id, { failed: enqueueResult.rejected.length });
  await repository.finalizeBroadcastIfDone(session.workspaceId, broadcast.id);
  return NextResponse.json({ error: "Some recipients could not be queued.", data: broadcast }, { status: 502 });
}
```

- [ ] **Step 5: Run focused tests**

Run: `pnpm vitest run src/lib/queue.test.ts app/api/broadcasts/route.test.ts`

Expected: PASS with exact accepted/rejected accounting.

- [ ] **Step 6: Commit queue accounting**

```bash
git add src/lib/queue.ts src/lib/queue.test.ts app/api/broadcasts/route.ts app/api/broadcasts/route.test.ts
git commit -m "fix: preserve partial broadcast enqueue results"
```

### Task 5: Surface automation UI controls and load failures correctly

**Files:**
- Modify: `src/components/automation-builder.tsx`
- Modify: `src/components/automation-builder.test.tsx`
- Modify: `src/components/sequences-screen.tsx`
- Modify: `src/components/sequences-screen.test.tsx`

**Interfaces:**
- Consumes: classic email-capture editor state and `/api/sequences` plus `/api/automations` responses.
- Produces: lead webhook/custom-field controls independent of fulfillment email; sequence page alerts for either failed fetch.

- [ ] **Step 1: Add failing component tests**

```tsx
it("shows webhook and custom questions when fulfillment email is off", async () => {
  render(<AutomationBuilder initialDefinition={classicEmailCapture} />);
  await user.click(screen.getByLabelText(/collect email/i));
  expect(screen.getByLabelText(/lead webhook/i)).toBeVisible();
  expect(screen.getByRole("button", { name: /add question/i })).toBeVisible();
});

it("shows a sequence API failure instead of an empty list", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ error: "Sequence service unavailable" }), { status: 503 }));
  render(<SequencesScreen />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Sequence service unavailable");
});
```

- [ ] **Step 2: Verify current rendering fails**

Run: `pnpm vitest run src/components/automation-builder.test.tsx src/components/sequences-screen.test.tsx`

Expected: FAIL because independent controls are nested under delivery state and `refresh` ignores response status.

- [ ] **Step 3: Separate fulfillment and capture controls**

Render the delivery subject/message/link fields only when `emailCapture.delivery` is enabled. Render `notifyUrl` and `fields` whenever `emailCapture` exists.

```tsx
{emailCaptureEnabled && (
  <>
    <FulfillmentEmailFields enabled={deliveryEnabled} />
    <LeadWebhookField />
    <CustomQuestionFields />
  </>
)}
```

- [ ] **Step 4: Make sequence refresh validate both responses**

```ts
const [sequenceResponse, automationResponse] = await Promise.all([
  fetch("/api/sequences"),
  fetch("/api/automations"),
]);
const [sequencePayload, automationPayload] = await Promise.all([
  sequenceResponse.json().catch(() => ({})),
  automationResponse.json().catch(() => ({})),
]);
if (!sequenceResponse.ok) throw new Error(sequencePayload.error ?? "Could not load sequences.");
if (!automationResponse.ok) throw new Error(automationPayload.error ?? "Could not load automations.");
```

Clear `pageError` at the start of a successful refresh and keep the alert visible until a successful reload.

- [ ] **Step 5: Run component tests**

Run: `pnpm vitest run src/components/automation-builder.test.tsx src/components/sequences-screen.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit UI error-state corrections**

```bash
git add src/components/automation-builder.tsx src/components/automation-builder.test.tsx src/components/sequences-screen.tsx src/components/sequences-screen.test.tsx
git commit -m "fix: expose automation controls and load errors"
```

### Task 6: Scope activity analytics and exports to one automation

**Files:**
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `app/api/insights/route.ts`
- Modify: `app/api/insights/funnels/route.ts`
- Modify: `app/api/insights/export/route.ts`
- Modify: `app/api/automations/[id]/activity/route.ts`
- Modify: `app/api/automations/[id]/activity/route.test.ts`
- Create: `app/api/insights/route.test.ts`
- Create: `app/api/insights/export/route.test.ts`
- Modify: `src/components/insights-panel.tsx`
- Modify: `src/components/automation-activity.tsx`
- Modify: `src/components/automation-activity.test.tsx`

**Interfaces:**
- Consumes: optional `automationId` query parameter.
- Produces: analytics repository methods accept `automationId?: string`; `countParticipantFunnel(workspaceId, automationId)` aggregates all rows; activity-page export URL includes the selected automation ID.

- [ ] **Step 1: Add failing cross-automation repository and route tests**

```ts
expect(await repository.countParticipantsPerDay("workspace_a", 14, "automation_1"))
  .toEqual([{ date: today, count: 1 }]);
expect(await repository.countParticipantsByMedia("workspace_a", "automation_1"))
  .toEqual([expect.objectContaining({ mediaId: "media_a", matched: 1 })]);

const response = await GET(new Request("http://localhost/api/insights/export?automationId=automation_1"));
expect(await response.text()).not.toContain("automation_2");
```

- [ ] **Step 2: Confirm scoping and 10,000-row tests fail**

Run: `pnpm vitest run src/lib/repository.test.ts app/api/insights/route.test.ts app/api/insights/funnels/route.test.ts app/api/insights/export/route.test.ts app/api/automations/[id]/activity/route.test.ts src/components/automation-activity.test.tsx`

Expected: FAIL because time-series/media/export helpers ignore `automationId` and the activity summary is derived from a capped list.

- [ ] **Step 3: Extend repository analytics contracts**

```ts
countParticipantsPerDay(workspaceId: string, days: number, automationId?: string): Promise<DailyCount[]>;
countExecutionsSentPerDay(workspaceId: string, days: number, automationId?: string): Promise<DailyCount[]>;
countParticipantsByMedia(workspaceId: string, automationId?: string): Promise<MediaPerformance[]>;
listRecentParticipants(workspaceId: string, limit: number, automationId?: string): Promise<AutomationParticipantRecord[]>;
countParticipantFunnel(workspaceId: string, automationId: string): Promise<ParticipantFunnelSummary>;
```

Apply `{ workspaceId, ...(automationId ? { automationId } : {}) }` in Prisma and the identical predicate in memory. Implement funnel counts with database aggregation/grouping over all matching rows, not `take: 10_000`.

- [ ] **Step 4: Pass the route filter to every query**

```ts
const automationId = new URL(request.url).searchParams.get("automationId") || undefined;
const [funnel, participantsPerDay, sentPerDay, mediaPerformance] = await Promise.all([
  repository.countParticipantsByState(session.workspaceId, automationId),
  repository.countParticipantsPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
  repository.countExecutionsSentPerDay(session.workspaceId, TIMESERIES_DAYS, automationId),
  repository.countParticipantsByMedia(session.workspaceId, automationId),
]);
```

Validate that a supplied automation exists in the session workspace before returning analytics/export data.

- [ ] **Step 5: Scope component export and insights URLs**

```tsx
const query = `?automationId=${encodeURIComponent(automationId)}`;
<a href={`/api/insights/export${query}`}>Export CSV</a>
```

Keep workspace-wide dashboard calls unchanged when no automation ID is supplied.

- [ ] **Step 6: Run analytics and component tests**

Run: `pnpm vitest run src/lib/repository.test.ts app/api/insights/route.test.ts app/api/insights/funnels/route.test.ts app/api/insights/export/route.test.ts app/api/automations/[id]/activity/route.test.ts src/components/automation-activity.test.tsx`

Expected: PASS, including a seeded total above 10,000.

- [ ] **Step 7: Commit analytics scoping**

```bash
git add src/lib/repository.ts src/lib/memory-repository.ts src/lib/prisma.ts src/lib/repository.test.ts app/api/insights app/api/automations/[id]/activity/route.ts app/api/automations/[id]/activity/route.test.ts src/components/insights-panel.tsx src/components/automation-activity.tsx src/components/automation-activity.test.tsx
git commit -m "fix: scope automation analytics and exports"
```

### Task 7: Make webhook identity and Instagram ownership deterministic

**Files:**
- Modify: `src/lib/meta/webhooks.ts`
- Modify: `src/lib/meta/webhooks.test.ts`
- Modify: `src/lib/repository.ts`
- Modify: `src/lib/memory-repository.ts`
- Modify: `src/lib/prisma.ts`
- Modify: `src/lib/repository.test.ts`
- Modify: `src/lib/meta/oauth.ts`
- Modify: `src/lib/meta/oauth.test.ts`
- Modify: `src/lib/meta/data-deletion.ts`
- Modify: `src/lib/meta/data-deletion.test.ts`
- Modify: `src/lib/meta/deauthorization.test.ts`
- Modify: `src/lib/queue.ts`
- Modify: `src/lib/queue.test.ts`
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260823180000_instagram_account_ownership/migration.sql`
- Create: `scripts/preflight-instagram-ownership.mjs`
- Modify: `package.json`
- Modify: `src/lib/migration-history.test.ts`

**Interfaces:**
- Consumes: normalized webhook payloads, OAuth connection upsert, account deletion, and queue deletion.
- Produces: stable-content-hashed fallback IDs; globally unique `InstagramConnection.igUserId`; explicit OAuth conflict; account-specific cleanup; queue matching on `accountId` or `igAccountId`.

- [ ] **Step 1: Add failing identity, ownership, deletion, and queue tests**

```ts
expect(normalizeWebhook(twoMessagesWithoutMidAtSameTimestamp).map((event) => event.id))
  .toEqual([expect.any(String), expect.any(String)]);
expect(new Set(normalizeWebhook(twoMessagesWithoutMidAtSameTimestamp).map((event) => event.id)).size).toBe(2);

await expect(repository.upsertConnection({ ...connectionB, igUserId: connectionA.igUserId }))
  .rejects.toMatchObject({ code: "INSTAGRAM_ACCOUNT_ALREADY_CONNECTED" });

expect(queueJob({ igAccountId: "ig_a" })).toBeDeleted();
expect(workspaceSiblingAutomation).toRemain();
```

- [ ] **Step 2: Verify current fallback and ownership behavior fails**

Run: `pnpm vitest run src/lib/meta/webhooks.test.ts src/lib/meta/oauth.test.ts src/lib/meta/data-deletion.test.ts src/lib/meta/deauthorization.test.ts src/lib/queue.test.ts src/lib/repository.test.ts`

Expected: FAIL because fallback IDs collide, connection ownership is only workspace-unique, queue deletion ignores `igAccountId`, and deletion can remove sibling workspace data.

- [ ] **Step 3: Hash stable fallback event content**

```ts
function fallbackMessagingEventId(accountId: string, timestamp: number, item: JsonRecord): string {
  return createHash("sha256")
    .update(`${accountId}\0${timestamp}\0${stableJson(item)}`)
    .digest("base64url");
}
```

Implement `stableJson` by recursively sorting object keys while preserving array order; exclude no fields. Use the helper for missing message/postback IDs.

- [ ] **Step 4: Add account-aware repository contracts and OAuth conflict handling**

```ts
findInstagramConnectionByAccount(igUserId: string): Promise<InstagramConnectionRecord | null>;
countConnections(workspaceId: string): Promise<number>;
deleteInstagramAccountData(workspaceId: string, connectionId: string, igUserId: string): Promise<void>;
```

Before upsert, query `igUserId` globally. If an existing connection belongs to another workspace, return HTTP 409 with `Instagram account is already connected to another workspace`; do not mutate either record.

- [ ] **Step 5: Add ownership preflight and database uniqueness**

```sql
SELECT "igUserId", COUNT(*)
FROM "InstagramConnection"
GROUP BY "igUserId"
HAVING COUNT(*) > 1;

DROP INDEX IF EXISTS "InstagramConnection_workspaceId_igUserId_key";
CREATE UNIQUE INDEX "InstagramConnection_igUserId_key" ON "InstagramConnection"("igUserId");
```

`scripts/preflight-instagram-ownership.mjs` must connect through `DATABASE_URL`, print duplicate IDs and exit 1 when rows exist, otherwise exit 0. Add `"preflight:instagram-ownership": "node scripts/preflight-instagram-ownership.mjs"` to `package.json`.

- [ ] **Step 6: Scope account deletion and match both queue payload shapes**

```ts
if (job?.data?.accountId === igUserId || job?.data?.igAccountId === igUserId) matches.push(job);
```

Delete account-scoped contacts, participants, jobs, connection tokens, and webhook rows. Delete workspace-wide automations/settings only when `countConnections(workspaceId) === 0` after removing the target connection.

- [ ] **Step 7: Verify ownership and deletion behavior**

Run: `pnpm prisma validate && pnpm db:generate && pnpm vitest run src/lib/meta/webhooks.test.ts src/lib/meta/oauth.test.ts src/lib/meta/data-deletion.test.ts src/lib/meta/deauthorization.test.ts src/lib/queue.test.ts src/lib/repository.test.ts src/lib/migration-history.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit deterministic account ownership**

```bash
git add src/lib/meta src/lib/queue.ts src/lib/queue.test.ts src/lib/repository.ts src/lib/memory-repository.ts src/lib/prisma.ts src/lib/repository.test.ts prisma/schema.prisma prisma/migrations/20260823180000_instagram_account_ownership scripts/preflight-instagram-ownership.mjs package.json src/lib/migration-history.test.ts
git commit -m "fix: enforce deterministic Instagram ownership"
```

### Task 8: Verify and deploy Release 1

**Files:**
- Modify: `e2e/smoke.spec.ts`
- Modify: `ops/COOLIFY_DEPLOYMENT.md`
- Create: `docs/releases/2026-08-23-automation-reliability-release-1.md`

**Interfaces:**
- Consumes: Tasks 1–7 and Coolify service `alzmminzroqpaftmprqt6lny`.
- Produces: green CI-equivalent evidence, PostgreSQL backup/preflight/migration evidence, deployed service health, and a release record without secrets.

- [ ] **Step 1: Add Release 1 browser regression scenarios**

```ts
test("sequence load failures are visible and source links can be cleared", async ({ page }) => {
  await page.route("**/api/sequences", (route) => route.fulfill({ status: 503, json: { error: "Sequence service unavailable" } }));
  await page.goto("/automations/sequences");
  await expect(page.getByRole("alert")).toContainText("Sequence service unavailable");
});

test("activity export stays scoped to the selected automation", async ({ page }) => {
  await page.goto("/automations/automation_1/activity");
  await expect(page.getByRole("link", { name: /export/i })).toHaveAttribute("href", "/api/insights/export?automationId=automation_1");
});
```

- [ ] **Step 2: Run the complete local quality gate**

Run: `pnpm check:branding && pnpm check:compose && pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm test:e2e`

Expected: every command exits 0; Vitest reports no failing files; Next and worker builds complete; Playwright passes.

- [ ] **Step 3: Commit verification coverage and runbook updates**

```bash
git add e2e/smoke.spec.ts ops/COOLIFY_DEPLOYMENT.md docs/releases/2026-08-23-automation-reliability-release-1.md
git commit -m "test: gate automation reliability release one"
```

- [ ] **Step 4: Back up and preflight production before migration**

Run from the protected production operator shell, without printing credentials:

```bash
pg_dump --format=custom --file=replyconnect-before-reliability-r1.dump "$DATABASE_URL"
pnpm preflight:instagram-ownership
pnpm db:migrate:deploy
```

Expected: backup exits 0; preflight prints zero duplicates; Prisma applies both Release 1 migrations. Stop the deployment if the duplicate query returns rows.

- [ ] **Step 5: Push and deploy the verified commit**

```bash
git status --short
git push origin main
```

Wait for repository CI and image publication, then redeploy only Coolify service `alzmminzroqpaftmprqt6lny` using the authenticated deployment mechanism documented in `ops/COOLIFY_DEPLOYMENT.md`. Never paste the deployment token into the shell command or release note.

- [ ] **Step 6: Verify container and public health**

```bash
docker compose -f docker-compose.coolify.yml ps
curl --fail --silent --show-error https://alzmminzroqpaftmprqt6lny.200.141.14.225.sslip.io/api/health
```

Expected: `web` is `running:healthy`, `worker` is running, `migrate` exited 0, PostgreSQL and Valkey are healthy, and `/api/health` returns HTTP 200.

- [ ] **Step 7: Record release-specific smoke evidence**

Verify with a test workspace: revoked cookie returns 401; sequence source can be linked then cleared; invalid automation payload returns 400; two-account broadcast jobs have distinct IDs in worker logs; activity/export data contains only the selected automation. Record timestamps, commit SHA, migration names, and redacted evidence in `docs/releases/2026-08-23-automation-reliability-release-1.md`, then commit the evidence-only update.

```bash
git add docs/releases/2026-08-23-automation-reliability-release-1.md
git commit -m "docs: record release one deployment evidence"
git push origin main
```
