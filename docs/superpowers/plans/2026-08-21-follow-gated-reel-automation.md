# Follow-Gated Reel Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a visual Instagram post/Reel automation that reacts to configured comment keywords, sends deterministic public and private replies, verifies the commenter follows the connected account after consent, and releases the configured link exactly once.

**Architecture:** Preserve the existing version 1 rule engine and introduce a version 2 campaign definition plus a persisted participant state machine. Meta API calls remain behind `MetaClient`; authenticated routes expose normalized media and activity records without exposing tokens; webhook events enter through the existing signed endpoint and BullMQ worker. The version 2 runner handles comment, quick-reply, and postback events before the existing standalone version 1 engine.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5.9, Zod 4, Prisma 6/PostgreSQL, BullMQ 6/Valkey, Vitest 4, Testing Library, Playwright, Meta Instagram API with Instagram Login v25.0.

**Spec:** `docs/superpowers/specs/2026-08-21-follow-gated-reel-automation-design.md`

## Global Constraints

- Use only Meta's official Instagram API with Instagram Login; no scraping, browser automation, unofficial endpoints, or AI-generated copy.
- Continue to read and execute persisted version 1 definitions unchanged.
- Request only `instagram_business_basic`, `instagram_business_manage_comments`, and `instagram_business_manage_messages`.
- Subscribe professional accounts to `comments,messages,messaging_postbacks,messaging_optins,messaging_referral`.
- Never return an Instagram access token to the browser or write one to logs.
- Never send the protected link unless Meta returns `is_user_follow_business: true` after the participant has interacted.
- Treat false, missing, stale, consent-denied, and API-error follow state as not verified.
- Allow one private reply per commenter/comment source and one final delivery per participant.
- Keep all automated follow-ups inside the 24-hour messaging window established by participant interaction.
- Keep TrackParcel, its Coolify project, its source tree, and its runtime resources untouched.

## File Structure

- `src/lib/automation/types.ts`: version 1 and version 2 contracts plus normalized interaction events.
- `src/lib/automation/definition.ts`: discriminated validation and normalization for both definition versions.
- `src/lib/automation/campaign-match.ts`: pure version 2 keyword/media matching and deterministic public-reply selection.
- `src/lib/automation/postback.ts`: signed, expiring opt-in/recheck payloads.
- `src/lib/automation/campaign-runner.ts`: participant state machine and Meta delivery orchestration.
- `src/lib/automation/runner.ts`: dispatch version 2 events first while preserving version 1 execution.
- `src/lib/meta/client.ts`: media, comment-reply, private-reply, quick-reply, direct-message, profile, and subscription calls.
- `src/lib/meta/webhooks.ts`: normalized comments, messages, quick replies, postbacks, opt-ins, and referrals.
- `src/lib/repository.ts`: participant and next-media repository contracts.
- `src/lib/prisma.ts`: PostgreSQL repository implementation.
- `src/lib/memory-repository.ts`: test/demo repository implementation with matching semantics.
- `app/api/meta/media/route.ts`: authenticated, token-safe media catalogue endpoint.
- `app/api/automations/[id]/activity/route.ts`: workspace-scoped campaign activity endpoint.
- `src/components/media-picker.tsx`: paginated visual media selection.
- `src/components/follow-gate-fields.tsx`: public reply, consent, follow prompt, and delivery form fields.
- `src/components/automation-builder.tsx`: version 2 campaign composition and save flow.
- `src/components/automation-activity.tsx`: participant timeline and diagnostics.
- `app/automations/[id]/activity/page.tsx`: activity page shell.
- `prisma/migrations/20260821010000_follow_gated_campaigns/migration.sql`: automation activation and participant persistence.

---

### Task 1: Version 2 Definition Contract

**Files:**
- Modify: `src/lib/automation/types.ts:1-55`
- Modify: `src/lib/automation/definition.ts:1-86`
- Modify: `src/lib/automation/definition.test.ts`
- Create: `src/lib/automation/campaign-match.ts`
- Create: `src/lib/automation/campaign-match.test.ts`

**Interfaces:**
- Produces: `FlowDefinition = FlowDefinitionV1 | FlowDefinitionV2`.
- Produces: `validateFlowDefinition(input: unknown): FlowDefinition`.
- Produces: `matchCampaign(definition: FlowDefinitionV2, event: NormalizedEvent): CampaignMatchResult`.
- Produces: `selectPublicReply(replies: string[], automationId: string, commentId: string): string | undefined`.

- [ ] **Step 1: Add failing version 2 validation tests**

Add cases that accept and normalize this exact shape, reject missing specific media, reject duplicate/empty keywords after normalization, enforce zero-to-five public replies, enforce 20-character quick-reply labels, and require an HTTPS delivery URL outside development:

```ts
const campaign = {
  version: 2,
  trigger: {
    type: "comment",
    source: "specific_media",
    mediaIds: ["media_1"],
    mediaSnapshots: [{ id: "media_1", mediaType: "VIDEO", mediaProductType: "REELS", permalink: "https://www.instagram.com/reel/demo/", timestamp: "2026-08-21T00:00:00.000Z" }],
    match: "keyword",
    keywords: [" Guide ", "guide", "PDF"],
  },
  publicReplies: ["Check your DMs"],
  openingMessage: { text: "Reply below so I can check your follow status.", optInButtonLabel: "Check follow" },
  followGate: { required: true, notFollowingMessage: "Follow this account, then tap below.", recheckButtonLabel: "I've followed" },
  delivery: { text: "You're verified — here is your guide.", url: "https://example.com/guide", buttonLabel: "Open guide" },
};

expect(validateFlowDefinition(campaign)).toMatchObject({
  version: 2,
  trigger: { keywords: ["guide", "pdf"] },
});
```

- [ ] **Step 2: Run the definition tests and verify failure**

Run: `pnpm vitest run src/lib/automation/definition.test.ts`

Expected: FAIL because only literal version 1 is accepted.

- [ ] **Step 3: Define the versioned TypeScript contracts**

Keep every existing version 1 type and add:

```ts
export type MediaSnapshot = {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: "AD" | "FEED" | "REELS" | "STORY";
  permalink: string;
  timestamp: string;
};

export type FlowDefinitionV2 = {
  version: 2;
  trigger: {
    type: "comment";
    source: "specific_media" | "all_media" | "next_media";
    mediaIds: string[];
    mediaSnapshots: MediaSnapshot[];
    match: "keyword" | "any";
    keywords: string[];
  };
  publicReplies: string[];
  openingMessage: { text: string; optInButtonLabel: string };
  followGate: { required: true; notFollowingMessage: string; recheckButtonLabel: string };
  delivery: { text: string; url: string; buttonLabel?: string };
};

export type FlowDefinition = FlowDefinitionV1 | FlowDefinitionV2;
```

- [ ] **Step 4: Implement the discriminated Zod schemas**

Use `z.discriminatedUnion("version", [flowV1Schema, flowV2Schema])`. Normalize keyword and media ID arrays, require `specific_media` to have at least one ID, require `all_media` and `next_media` to have no IDs, and require snapshot IDs to equal the selected ID set.

```ts
const flowSchema = z.discriminatedUnion("version", [flowV1Schema, flowV2Schema]);

export function validateFlowDefinition(input: unknown): FlowDefinition {
  const parsed = flowSchema.parse(input);
  return parsed.version === 1 ? normalizeV1(parsed) : normalizeV2(parsed);
}
```

- [ ] **Step 5: Add failing campaign matching tests**

Cover specific media, all media, any-comment, keyword, missing media IDs, and stable public-reply rotation:

```ts
expect(selectPublicReply(["A", "B", "C"], "automation_1", "comment_9"))
  .toBe(selectPublicReply(["A", "B", "C"], "automation_1", "comment_9"));
expect(matchCampaign(campaignDefinition, commentEvent)).toEqual({
  matched: true,
  keyword: "guide",
});
```

- [ ] **Step 6: Implement pure matching helpers**

`matchCampaign` handles keyword and source matching for `specific_media` and `all_media`; it returns `{ matched: false, reason }` for `next_media` until the runner supplies a bound media ID. Use SHA-256 over `${automationId}\0${commentId}` modulo reply count for stable rotation.

```ts
export function selectPublicReply(replies: string[], automationId: string, commentId: string) {
  if (replies.length === 0) return undefined;
  const value = createHash("sha256").update(`${automationId}\0${commentId}`).digest().readUInt32BE(0);
  return replies[value % replies.length];
}
```

- [ ] **Step 7: Run focused and existing engine tests**

Run: `pnpm vitest run src/lib/automation/definition.test.ts src/lib/automation/campaign-match.test.ts src/lib/automation/match.test.ts src/lib/automation/engine.test.ts`

Expected: PASS, including unchanged version 1 cases.

- [ ] **Step 8: Commit the contract**

```bash
git add src/lib/automation/types.ts src/lib/automation/definition.ts src/lib/automation/definition.test.ts src/lib/automation/campaign-match.ts src/lib/automation/campaign-match.test.ts
git commit -m "feat: add follow-gated campaign definition"
```

---

### Task 2: Participant and Activation Persistence

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260821010000_follow_gated_campaigns/migration.sql`
- Modify: `src/lib/repository.ts:1-93`
- Modify: `src/lib/prisma.ts:19-260`
- Modify: `src/lib/memory-repository.ts:22-218`
- Modify: `src/lib/repository.test.ts`
- Modify: `app/api/automations/[id]/route.ts:11-36`

**Interfaces:**
- Produces: `ParticipantState` and `AutomationParticipantRecord`.
- Produces: `createParticipant(input): Promise<{ created: boolean; record: AutomationParticipantRecord }>`.
- Produces: `findPendingParticipant(igAccountId: string, igScopedUserId: string): Promise<AutomationParticipantRecord | null>`.
- Produces: `transitionParticipant(id, expectedStates, patch): Promise<AutomationParticipantRecord | null>`.
- Produces: `bindNextMedia(workspaceId, automationId, mediaId, publishedAt): Promise<boolean>`.
- Produces: `listParticipants(workspaceId, automationId, limit): Promise<AutomationParticipantRecord[]>`.
- Produces: `expireParticipantsByInstagramAccount(igAccountId, reason): Promise<number>`.
- Produces: `deleteParticipantsByWorkspaceIds(workspaceIds): Promise<number>`.

- [ ] **Step 1: Add failing repository tests**

Test duplicate comment creation across the same and different matching automations, monotonic transition claims, pending-participant lookup, final-delivery dedupe, workspace-scoped activity listing, and one-winner next-media binding.

```ts
const first = await repository.createParticipant(input);
const duplicate = await repository.createParticipant(input);
expect(first.created).toBe(true);
expect(duplicate.created).toBe(false);
expect(await repository.transitionParticipant(first.record.id, ["OPTED_IN"], {
  state: "FOLLOW_VERIFIED",
  followStatus: true,
  followCheckedAt: now,
})).toMatchObject({ state: "FOLLOW_VERIFIED" });
```

- [ ] **Step 2: Run repository tests and verify failure**

Run: `pnpm vitest run src/lib/repository.test.ts`

Expected: FAIL because participant methods do not exist.

- [ ] **Step 3: Add Prisma enums, relations, and fields**

Add nullable `activatedAt` and `boundMediaId` to `Automation`. Add `AutomationParticipant` with string IDs, source comment/media IDs, JSON media snapshot, matched keyword, Instagram-scoped user ID, participant state, per-action statuses/provider IDs/errors for public reply, opener, follow check, and final delivery, follow status/check time, messaging-window expiry, action timestamps, recheck count, and created/updated timestamps. Add these constraints:

```prisma
@@unique([workspaceId, instagramAccountId, sourceCommentId])
@@index([instagramAccountId, igScopedUserId, state])
@@index([workspaceId, automationId, updatedAt])
```

- [ ] **Step 4: Write the explicit SQL migration**

Create the enum and table, add foreign keys with `ON DELETE CASCADE`, add `activatedAt`/`boundMediaId`, and create the three indexes matching the Prisma schema. Do not edit any earlier migration.

```sql
ALTER TABLE "Automation" ADD COLUMN "activatedAt" TIMESTAMP(3), ADD COLUMN "boundMediaId" TEXT;
CREATE TYPE "ParticipantState" AS ENUM ('COMMENT_MATCHED','OPENING_SENT','OPTED_IN','FOLLOW_REQUIRED','FOLLOW_VERIFIED','LINK_SENT','EXPIRED','FAILED');
CREATE TABLE "AutomationParticipant" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "automationId" TEXT NOT NULL REFERENCES "Automation"("id") ON DELETE CASCADE,
  "instagramAccountId" TEXT NOT NULL,
  "igScopedUserId" TEXT,
  "sourceCommentId" TEXT NOT NULL,
  "sourceMediaId" TEXT NOT NULL,
  "sourceMediaSnapshot" JSONB NOT NULL,
  "matchedKeyword" TEXT,
  "state" "ParticipantState" NOT NULL DEFAULT 'COMMENT_MATCHED',
  "publicReplyStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "publicReplyProviderId" TEXT,
  "publicReplySentAt" TIMESTAMP(3),
  "publicReplyError" TEXT,
  "openingStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "openingProviderId" TEXT,
  "openingSentAt" TIMESTAMP(3),
  "openingError" TEXT,
  "followStatus" BOOLEAN,
  "followCheckedAt" TIMESTAMP(3),
  "followCheckError" TEXT,
  "finalDeliveryStatus" TEXT NOT NULL DEFAULT 'PENDING',
  "finalProviderId" TEXT,
  "finalDeliveredAt" TIMESTAMP(3),
  "finalDeliveryError" TEXT,
  "messagingWindowExpiresAt" TIMESTAMP(3),
  "recheckCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
```

- [ ] **Step 5: Extend repository types**

Use an exact state union:

```ts
export type ParticipantState =
  | "COMMENT_MATCHED" | "OPENING_SENT" | "OPTED_IN" | "FOLLOW_REQUIRED"
  | "FOLLOW_VERIFIED" | "LINK_SENT" | "EXPIRED" | "FAILED";
```

Include `activatedAt?: string` and `boundMediaId?: string` on `AutomationRecord`. Extend `UpdateAutomationInput` with those two fields. Set `version` from `input.definition.version` on create/update.

- [ ] **Step 6: Implement memory repository semantics**

Use maps keyed by participant ID and source uniqueness `${workspaceId}:${instagramAccountId}:${sourceCommentId}`. `transitionParticipant` must return null unless the current state is in `expectedStates`. `bindNextMedia` succeeds only when the automation is active, has no bound media, and `publishedAt > activatedAt`.

```ts
async transitionParticipant(id, expectedStates, patch) {
  const current = participants.get(id);
  if (!current || !expectedStates.includes(current.state)) return null;
  const updated = { ...current, ...patch, updatedAt: now() };
  participants.set(id, updated);
  return copy(updated);
}
```

- [ ] **Step 7: Implement Prisma repository transactions**

Use unique-constraint recovery for `createParticipant`, `updateMany` plus readback for state claims, and this atomic next-media predicate:

```ts
await client.automation.updateMany({
  where: {
    id: automationId,
    workspaceId,
    status: "ACTIVE",
    boundMediaId: null,
    activatedAt: { lt: new Date(publishedAt) },
  },
  data: { boundMediaId: mediaId },
});
```

- [ ] **Step 8: Make activation timestamps explicit**

In `PATCH /api/automations/[id]`, when status changes to `ACTIVE`, set `activatedAt` to the current time and clear `boundMediaId` only when the definition uses `next_media`. Pausing must retain participant history.

```ts
if (body.status === "ACTIVE") {
  patch.status = "ACTIVE";
  patch.activatedAt = new Date().toISOString();
  if ((patch.definition ?? current.definition).version === 2 &&
      (patch.definition ?? current.definition).trigger.source === "next_media") patch.boundMediaId = null;
}
```

- [ ] **Step 9: Generate Prisma and run tests**

Run: `pnpm prisma generate && pnpm vitest run src/lib/repository.test.ts`

Expected: PASS.

- [ ] **Step 10: Commit persistence**

```bash
git add prisma/schema.prisma prisma/migrations/20260821010000_follow_gated_campaigns/migration.sql src/lib/repository.ts src/lib/prisma.ts src/lib/memory-repository.ts src/lib/repository.test.ts 'app/api/automations/[id]/route.ts'
git commit -m "feat: persist campaign participants"
```

---

### Task 3: Signed Interaction Payloads

**Files:**
- Create: `src/lib/automation/postback.ts`
- Create: `src/lib/automation/postback.test.ts`

**Interfaces:**
- Produces: `createInteractionPayload(input: { participantId: string; action: "opt_in" | "recheck" }, secret: string, now?: number): string`.
- Produces: `readInteractionPayload(value: string, secret: string, now?: number): { participantId: string; action: "opt_in" | "recheck" } | null`.

- [ ] **Step 1: Write failing signing tests**

Test round-trip, altered signature, altered participant/action, malformed input, wrong secret, and expiry after 24 hours.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/lib/automation/postback.test.ts`

Expected: FAIL because the module is absent.

- [ ] **Step 3: Implement compact HMAC payloads**

Encode `{ v: 1, p: participantId, a: action, exp: now + 86_400_000 }` as base64url JSON and append a base64url HMAC-SHA256 signature. Verify with `timingSafeEqual`; return null on every parse or validation failure.

```ts
const encoded = Buffer.from(JSON.stringify(body)).toString("base64url");
const signature = createHmac("sha256", secret).update(encoded).digest("base64url");
return `${encoded}.${signature}`;
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm vitest run src/lib/automation/postback.test.ts`

```bash
git add src/lib/automation/postback.ts src/lib/automation/postback.test.ts
git commit -m "feat: sign campaign interaction payloads"
```

---

### Task 4: Complete the Meta Client Surface

**Files:**
- Modify: `src/lib/meta/types.ts`
- Modify: `src/lib/meta/client.ts:1-129`
- Modify: `src/lib/meta/client.test.ts:1-92`

**Interfaces:**
- Produces: `listMedia(connection, after?): Promise<MetaMediaPage>`.
- Produces: `getMedia(connection, mediaId): Promise<MetaMedia>`.
- Produces: `replyToComment(connection, commentId, text): Promise<{ id: string }>`.
- Produces: `sendPrivateReply(connection, commentId, message: string | MetaPrivateReply): Promise<MetaSendResult>`.
- Produces: `sendQuickReply(connection, recipientId, text, reply): Promise<MetaSendResult>`.
- Produces: `getUserFollowStatus(connection, igScopedUserId): Promise<{ isUserFollowingBusiness: boolean }>`.

- [ ] **Step 1: Add failing payload and response tests**

Assert these requests:

```ts
POST /v25.0/comment_1/replies
{ "message": "Check your DMs" }

POST /v25.0/ig_1/messages
{
  "recipient": { "comment_id": "comment_1" },
  "message": {
    "text": "Reply below so I can check your follow status.",
    "quick_replies": [{ "content_type": "text", "title": "Check follow", "payload": "signed-opt-in" }]
  }
}

POST /v25.0/ig_1/messages
{
  "recipient": { "id": "igsid_1" },
  "messaging_type": "RESPONSE",
  "message": {
    "text": "Follow this account, then tap below.",
    "quick_replies": [{ "content_type": "text", "title": "I've followed", "payload": "signed-value" }]
  }
}

GET /v25.0/igsid_1?fields=is_user_follow_business
```

Also test media pagination fields `id,caption,media_type,media_product_type,permalink,media_url,thumbnail_url,timestamp` and rejection of malformed Meta responses.

- [ ] **Step 2: Run client tests and verify failure**

Run: `pnpm vitest run src/lib/meta/client.test.ts`

Expected: FAIL for absent methods and old subscription fields.

- [ ] **Step 3: Add normalized Meta types**

```ts
export type MetaMedia = {
  id: string;
  caption?: string;
  mediaType: "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";
  mediaProductType?: "AD" | "FEED" | "REELS" | "STORY";
  permalink: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  timestamp: string;
};
export type MetaMediaPage = { data: MetaMedia[]; after?: string };
export type MetaPrivateReply = { text: string; quickReply?: { title: string; payload: string } };
```

- [ ] **Step 4: Implement comment, media, message, and profile methods**

Keep bearer authorization in `request`. Encode cursor pagination through `after`; never return the request URL with its token. Require a literal boolean for `is_user_follow_business`, otherwise throw `MetaApiError("Meta did not return follower status", 502)`.

```ts
async getUserFollowStatus(connection: MetaConnection, igScopedUserId: string) {
  const url = new URL(`${this.baseUrl}/${this.apiVersion}/${igScopedUserId}`);
  url.searchParams.set("fields", "is_user_follow_business");
  const data = await this.request(url, connection.accessToken);
  if (typeof data.is_user_follow_business !== "boolean") throw new MetaApiError("Meta did not return follower status", 502);
  return { isUserFollowingBusiness: data.is_user_follow_business };
}
```

- [ ] **Step 5: Expand professional account subscriptions**

Change `subscribed_fields` to:

```ts
"comments,messages,messaging_postbacks,messaging_optins,messaging_referral"
```

- [ ] **Step 6: Preserve existing message methods**

Keep version 1 `sendDirectMessage` behavior and add quick-reply/private-reply variants without changing existing callers.

```ts
async sendPrivateReply(connection: MetaConnection, commentId: string, message: string | MetaPrivateReply) {
  const normalized = typeof message === "string" ? { text: message } : message;
  return this.post(connection, buildPrivateReplyPayload(commentId, normalized));
}
```

- [ ] **Step 7: Run tests and commit**

Run: `pnpm vitest run src/lib/meta/client.test.ts src/lib/meta/oauth.test.ts src/lib/meta/token-refresh.test.ts`

```bash
git add src/lib/meta/types.ts src/lib/meta/client.ts src/lib/meta/client.test.ts
git commit -m "feat: add Meta campaign API operations"
```

---

### Task 5: Authenticated Media Catalogue

**Files:**
- Create: `app/api/meta/media/route.ts`
- Create: `app/api/meta/media/route.test.ts`

**Interfaces:**
- Consumes: `MetaClient.listMedia(connection, after)` from Task 4.
- Produces: `GET /api/meta/media?after=cursor` returning `{ data: MetaMedia[], paging: { after?: string } }`.

- [ ] **Step 1: Write route tests**

Test unauthorized 401, no connected account 409, missing encryption key 503, successful pagination, invalid cursor rejection, and serialized output containing no `accessToken` or `accessTokenEncrypted` key.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run app/api/meta/media/route.test.ts`

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route**

Read the owner session, select the workspace's connected account, decrypt its token server-side, call `listMedia`, and return normalized media. Restrict `after` to a non-empty string of at most 500 characters.

```ts
const connection = (await repository.listConnections(session.workspaceId)).find((item) => item.status === "CONNECTED");
if (!connection) return Response.json({ error: "Connect Instagram first" }, { status: 409 });
const page = await client.listMedia({ igUserId: connection.igUserId, accessToken: unsealSecret(connection.accessTokenEncrypted, key) }, after);
return Response.json({ data: page.data, paging: { after: page.after } });
```

- [ ] **Step 4: Run tests and commit**

Run: `pnpm vitest run app/api/meta/media/route.test.ts`

```bash
git add app/api/meta/media/route.ts app/api/meta/media/route.test.ts
git commit -m "feat: expose connected Instagram media"
```

---

### Task 6: Normalize Interaction Webhooks

**Files:**
- Modify: `src/lib/automation/types.ts`
- Modify: `src/lib/meta/webhooks.ts:17-101`
- Modify: `src/lib/meta/webhooks.test.ts`
- Modify: `src/lib/queue.test.ts`

**Interfaces:**
- Produces: normalized `message.received`, `quick_reply.received`, `postback.received`, `optin.received`, and `referral.received` events.
- Every interaction event exposes `recipientId` as the external Instagram-scoped sender and `interactionPayload` as the opaque payload when present.

- [ ] **Step 1: Add failing webhook fixtures**

Add official-shape fixtures for `message.quick_reply.payload`, `postback.payload`, `optin.ref`, and `referral.ref`. Assert professional-account echoes and self messages stay ignored.

```ts
expect(normalizeWebhook(quickReplyPayload)[0]).toMatchObject({
  type: "quick_reply.received",
  recipientId: "igsid_1",
  interactionPayload: "signed-value",
});
```

- [ ] **Step 2: Run webhook tests and verify failure**

Run: `pnpm vitest run src/lib/meta/webhooks.test.ts src/lib/queue.test.ts`

Expected: FAIL because quick replies are currently normalized as plain messages and opt-in/referral events are ignored.

- [ ] **Step 3: Extend `NormalizedEvent` without breaking version 1**

Add the three event literals and optional `interactionPayload`. Keep `text`, `recipientId`, and existing event literals so current message rules still compile.

```ts
type: "comment.created" | "message.received" | "quick_reply.received" |
  "postback.received" | "optin.received" | "referral.received";
interactionPayload?: string;
```

- [ ] **Step 4: Normalize interaction payloads before plain messages**

When `message.quick_reply.payload` exists, emit `quick_reply.received` rather than `message.received`. Preserve payload and visible button text separately. Continue deriving queue IDs from account plus provider event ID.

```ts
const quickReply = record(message?.quick_reply);
events.push({
  id: messageId, accountId,
  type: quickReply ? "quick_reply.received" : "message.received",
  text: stringValue(message?.text) ?? "",
  interactionPayload: stringValue(quickReply?.payload),
  recipientId, timestamp,
});
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run src/lib/meta/webhooks.test.ts src/lib/queue.test.ts`

```bash
git add src/lib/automation/types.ts src/lib/meta/webhooks.ts src/lib/meta/webhooks.test.ts src/lib/queue.test.ts
git commit -m "feat: normalize Instagram interaction webhooks"
```

---

### Task 7: Follow-Gate Participant State Machine

**Files:**
- Create: `src/lib/automation/campaign-runner.ts`
- Create: `src/lib/automation/campaign-runner.test.ts`
- Modify: `src/lib/automation/runner.ts:1-116`
- Modify: `src/lib/automation/runner.test.ts`
- Modify: `src/worker.ts:1-52`
- Modify: `app/api/meta/webhook/route.ts:1-58`
- Modify: `src/lib/env.ts:1-44`
- Modify: `src/lib/runtime-commands.test.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: Task 1 matching, Task 2 participant repository, Task 3 signed payloads, Task 4 Meta methods.
- Produces: `processCampaignEvent(event, automation, mapping, repository, options): Promise<CampaignRunnerResult>`.
- Produces internal helpers: `deliverPublicReply`, `deliverOpeningReply`, `processPendingCampaignInteraction`, `promptForFollow`, and `verifyAndDeliver`, each accepting the participant plus explicit dependencies shown in the implementation steps.
- Produces: version 2-first dispatch from `processNormalizedEvent`.

- [ ] **Step 1: Add failing comment-path tests**

Verify a matching selected Reel creates one participant, sends one deterministic public reply, sends one opening private reply with a signed opt-in payload, stores the private reply's returned `recipient_id`, and records independent provider IDs. Replaying the same comment retries only failed/pending actions and never repeats a successful public reply or opener. When two active campaigns match, the newest-updated matching campaign wins deterministically and the other campaign does not send.

- [ ] **Step 2: Add failing next-media tests**

Mock `getMedia` with a timestamp before activation and assert no bind. Then return a timestamp after activation and assert only one competing event can bind and continue.

- [ ] **Step 3: Add failing consent/follow tests**

Cover:

```ts
opt-in + follows     -> FOLLOW_VERIFIED -> LINK_SENT
opt-in + not follows -> FOLLOW_REQUIRED + recheck quick reply
recheck + follows    -> LINK_SENT
recheck + false      -> FOLLOW_REQUIRED with incremented recheckCount
invalid payload      -> ignored
expired window       -> EXPIRED
profile API error    -> FAILED with no link
duplicate webhook    -> no duplicate link
```

- [ ] **Step 4: Run and verify failures**

Run: `pnpm vitest run src/lib/automation/campaign-runner.test.ts src/lib/automation/runner.test.ts`

Expected: FAIL because campaign orchestration is absent.

- [ ] **Step 5: Implement the comment transaction flow**

Generate the participant ID before sending. Create the participant first; the uniqueness winner begins delivery and duplicate/retry events load the same record. Claim public and opening actions separately, retry only pending/retryable failures, and never resend a successful action. Set `OPENING_SENT` only after Meta accepts the opener and store the returned Instagram-scoped `recipient_id` for later matching.

```ts
const created = await repository.createParticipant(input);
let participant = created.record;
if (participant.publicReplyStatus !== "SENT") participant = await deliverPublicReply(participant, definition, client, repository);
if (participant.openingStatus !== "SENT") participant = await deliverOpeningReply(participant, definition, client, repository, interactionSecret);
return { handled: true, participantId: participant.id };
```

- [ ] **Step 6: Implement consent and follow checks**

Parse and verify the interaction payload, require participant/account/sender matches, set `messagingWindowExpiresAt = event.timestamp + 24 hours`, query `is_user_follow_business`, and transition through allowed expected states. Use quick replies for opt-in/recheck and the existing URL button delivery for the final link.

```ts
const payload = readInteractionPayload(event.interactionPayload ?? "", interactionSecret, event.timestamp);
if (!payload) return { handled: false };
const follow = await client.getUserFollowStatus(connection, event.recipientId);
return follow.isUserFollowingBusiness
  ? verifyAndDeliver(participant, definition, event, client, repository)
  : promptForFollow(participant, definition, event, client, repository, interactionSecret);
```

- [ ] **Step 7: Enforce cooldown and anti-loop rules**

Reject rechecks within 10 seconds, cap `recheckCount` at 10, and mark expired events when the messaging window is closed. These constants live at the top of `campaign-runner.ts` and have direct boundary tests.

```ts
const RECHECK_COOLDOWN_MS = 10_000;
const MAX_RECHECKS = 10;
const MESSAGE_WINDOW_MS = 24 * 60 * 60 * 1_000;
```

- [ ] **Step 8: Route interaction events before version 1 automations**

In `processNormalizedEvent`, process signed campaign interactions first. Do not let handled quick replies or postbacks fall through to generic message rules. For comments, evaluate active version 2 campaigns in the repository's newest-updated order and run only the first match. A version 2 match consumes that comment event so overlapping version 2 or version 1 private-reply rules cannot send a second opener; when no version 2 campaign matches, run version 1 rules unchanged.

```ts
const interaction = await processPendingCampaignInteraction(event, mapping, repository, options);
if (interaction.handled) return interaction.result;
const campaigns = automations.filter((item) => item.definition.version === 2);
const legacy = automations.filter((item) => item.definition.version === 1);
const campaign = campaigns.find((item) => matchCampaign(item.definition, event).matched);
if (campaign) return processCampaignEvent(event, campaign, mapping, repository, options);
```

- [ ] **Step 9: Pass the signing secret in both execution paths**

Add `interactionSecret` to `RunnerOptions`; pass `env.metaAppSecret` from the worker and synchronous webhook fallback. If absent, version 2 campaigns fail visibly while version 1 remains operational.

```ts
type RunnerOptions = {
  client?: AutomationRunnerClient;
  tokenEncryptionKey?: string;
  interactionSecret?: string;
  campaignsEnabled?: boolean;
  finalAttempt?: boolean;
};
```

- [ ] **Step 10: Add the controlled rollout flag**

Parse `FOLLOW_GATED_CAMPAIGNS_ENABLED` as a strict boolean in `getServerEnv`, default it to `false`, document it in `.env.example`, and skip version 2 execution when false while leaving creation, preview, and version 1 execution intact. Add environment tests for missing, `true`, and invalid values.

```ts
function booleanEnv(value: string | undefined): boolean {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("FOLLOW_GATED_CAMPAIGNS_ENABLED must be true or false");
}
```

- [ ] **Step 11: Run focused and full automation tests**

Run: `pnpm vitest run src/lib/automation/campaign-runner.test.ts src/lib/automation/runner.test.ts src/lib/automation/engine.test.ts src/lib/automation/match.test.ts`

Expected: PASS.

- [ ] **Step 12: Commit orchestration**

```bash
git add src/lib/automation/campaign-runner.ts src/lib/automation/campaign-runner.test.ts src/lib/automation/runner.ts src/lib/automation/runner.test.ts src/worker.ts app/api/meta/webhook/route.ts src/lib/env.ts src/lib/runtime-commands.test.ts .env.example
git commit -m "feat: run follow-gated Instagram campaigns"
```

---

### Task 8: Visual Campaign Builder

**Files:**
- Create: `src/components/media-picker.tsx`
- Create: `src/components/media-picker.test.tsx`
- Create: `src/components/follow-gate-fields.tsx`
- Create: `src/components/automation-editor-screen.tsx`
- Create: `app/automations/[id]/edit/page.tsx`
- Modify: `src/components/automation-builder.tsx:1-376`
- Modify: `src/components/automation-builder.test.tsx`
- Modify: `app/api/automations/[id]/route.ts`
- Modify: `src/components/automation-list.tsx`
- Modify: `app/globals.css:148-198`

**Interfaces:**
- Consumes: `GET /api/meta/media` from Task 5 and `FlowDefinitionV2` from Task 1.
- Produces: version 2 definition JSON through existing automation POST/PATCH routes.

- [ ] **Step 1: Write failing media picker tests**

Test loading, empty account, error, selected state, multi-select, Reel/post labels, image fallback, and `Load more` cursor behavior. Assert thumbnails have useful alt text and selection works by keyboard.

- [ ] **Step 2: Implement `MediaPicker`**

Expose controlled props:

```ts
type MediaPickerProps = {
  selectedIds: string[];
  onChange: (ids: string[], snapshots: MediaSnapshot[]) => void;
};
```

Load pages on demand, merge by media ID, and render `thumbnailUrl ?? mediaUrl`. Before `onChange`, build immutable snapshots containing ID, caption, type, product type, permalink, and timestamp; omit temporary `mediaUrl` and `thumbnailUrl` values from the saved definition.

- [ ] **Step 3: Write failing builder tests**

Exercise all/source/next controls, media selection, keywords, up to five public reply variations, opening consent copy, follow prompt, recheck label, final URL/button, review summary, local test preview, save-draft, save-and-activate, and submitted JSON. Verify no final URL appears in the opening-message preview.

- [ ] **Step 4: Replace the new-flow form with version 2 stages**

Keep version 1 initial-definition rendering available for edit compatibility, but default new automations to version 2. Build these sections in order: content, trigger, public reply, opening DM, follow gate, delivery, review/save.

```ts
function buildDefinition(): FlowDefinitionV2 {
  return {
    version: 2,
    trigger: { type: "comment", source, mediaIds: selectedIds, mediaSnapshots: snapshots, match, keywords },
    publicReplies,
    openingMessage: { text: openingText, optInButtonLabel },
    followGate: { required: true, notFollowingMessage, recheckButtonLabel },
    delivery: { text: deliveryText, url: deliveryUrl, buttonLabel: deliveryButtonLabel || undefined },
  };
}
```

- [ ] **Step 5: Add client-side validation copy**

Block save when specific media has no selection, keyword mode has no keywords, public replies exceed five, labels exceed 20 characters, or delivery is not HTTPS. Permit `http://localhost` only while running locally. Surface the server error unchanged if API validation is stricter.

```ts
const url = new URL(deliveryUrl);
const local = url.protocol === "http:" && url.hostname === "localhost";
if (url.protocol !== "https:" && !local) return setError("Delivery links must use HTTPS.");
```

- [ ] **Step 6: Add local test preview and activation controls**

The `Test preview` control cycles through comment, opening message, not-following prompt, and verified delivery entirely in browser state and is clearly labelled as not sending to Instagram. `Save draft` performs the existing POST/PATCH. `Save & activate` saves first and then PATCHes the returned automation ID to `ACTIVE`, ensuring the server owns `activatedAt`.

```ts
const response = await fetch(automationId ? `/api/automations/${automationId}` : "/api/automations", {
  method: automationId ? "PATCH" : "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name, definition: buildDefinition() }),
});
const { data: saved } = await response.json() as { data: AutomationRecord };
if (intent === "activate") {
  await fetch(`/api/automations/${saved.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status: "ACTIVE" }),
  });
}
```

- [ ] **Step 7: Add editing support**

Add a workspace-authenticated `GET` handler to `/api/automations/[id]`, a client editor screen that loads the record, and `/automations/[id]/edit`. Add Edit links on automation rows. Version 1 records render through existing fields; version 2 records render the campaign stages.

```ts
export async function GET(request: Request, context: RouteContext) {
  const session = getOwnerSessionFromRequest(request);
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const record = await getRepository().getAutomation(session.workspaceId, (await context.params).id);
  return record ? Response.json({ data: record }) : Response.json({ error: "Automation not found" }, { status: 404 });
}
```

- [ ] **Step 8: Add responsive and accessible styles**

Create grid, selected-card, loading skeleton, message-step preview, and mobile one-column styles under existing builder classes. Preserve the ReplyConnect color system and visible focus states.

- [ ] **Step 9: Run component tests**

Run: `pnpm vitest run src/components/media-picker.test.tsx src/components/automation-builder.test.tsx`

Expected: PASS.

- [ ] **Step 10: Commit the builder**

```bash
git add src/components/media-picker.tsx src/components/media-picker.test.tsx src/components/follow-gate-fields.tsx src/components/automation-editor-screen.tsx src/components/automation-builder.tsx src/components/automation-builder.test.tsx 'app/automations/[id]/edit/page.tsx' 'app/api/automations/[id]/route.ts' src/components/automation-list.tsx app/globals.css
git commit -m "feat: build visual Reel campaign editor"
```

---

### Task 9: Campaign Activity and Diagnostics

**Files:**
- Create: `app/api/automations/[id]/activity/route.ts`
- Create: `app/api/automations/[id]/activity/route.test.ts`
- Create: `src/components/automation-activity.tsx`
- Create: `src/components/automation-activity.test.tsx`
- Create: `app/automations/[id]/activity/page.tsx`
- Modify: `src/components/automation-list.tsx:64-132`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `listParticipants(workspaceId, automationId, 100)` from Task 2.
- Produces: workspace-scoped activity JSON and `/automations/:id/activity` UI.

- [ ] **Step 1: Write failing API authorization tests**

Test unauthorized 401, cross-workspace 404, and successful newest-first participant output. Confirm token fields and raw webhook payloads are absent.

- [ ] **Step 2: Implement the activity route**

Verify the automation belongs to the session workspace, then return at most 100 participant summaries with media snapshot, matched keyword, lifecycle state, follow status/check time, per-action statuses/errors, and delivery timestamps.

```ts
const automation = await repository.getAutomation(session.workspaceId, id);
if (!automation) return Response.json({ error: "Automation not found" }, { status: 404 });
const participants = await repository.listParticipants(session.workspaceId, id, 100);
return Response.json({ data: participants.map(({ sourceMediaSnapshot, matchedKeyword, state, followStatus, followCheckedAt, publicReplyStatus, publicReplyError, openingStatus, openingError, finalDeliveryStatus, finalDeliveryError, finalDeliveredAt }) => ({ sourceMediaSnapshot, matchedKeyword, state, followStatus, followCheckedAt, publicReplyStatus, publicReplyError, openingStatus, openingError, finalDeliveryStatus, finalDeliveryError, finalDeliveredAt })) });
```

- [ ] **Step 3: Write failing activity UI tests**

Test empty state and rows for `FOLLOW_REQUIRED`, `LINK_SENT`, `EXPIRED`, and `FAILED`, including source Reel permalink and diagnostic text.

- [ ] **Step 4: Implement the activity page**

Render source media type/caption, keyword, state badge, public/opening/follow/final timestamps, per-action diagnostics, and a safe external Instagram permalink. Add an Activity link to each non-compact automation row. Do not persist or render expired Meta CDN URLs from participant history.

```tsx
<a href={participant.sourceMediaSnapshot.permalink} target="_blank" rel="noreferrer">View on Instagram</a>
<StatusBadge status={participant.state} />
<p>{participant.matchedKeyword ?? "Any comment"}</p>
```

- [ ] **Step 5: Run tests and commit**

Run: `pnpm vitest run app/api/automations/[id]/activity/route.test.ts src/components/automation-activity.test.tsx`

```bash
git add 'app/api/automations/[id]/activity/route.ts' 'app/api/automations/[id]/activity/route.test.ts' src/components/automation-activity.tsx src/components/automation-activity.test.tsx 'app/automations/[id]/activity/page.tsx' src/components/automation-list.tsx app/globals.css
git commit -m "feat: show campaign participant activity"
```

---

### Task 10: Deletion, Disconnect, Privacy, and App Review

**Files:**
- Modify: `src/lib/prisma.ts:147-178`
- Modify: `src/lib/memory-repository.ts:102-137`
- Modify: `src/lib/meta/deauthorization.ts:8-18`
- Modify: `src/lib/meta/deauthorization.test.ts`
- Modify: `src/lib/meta/data-deletion.test.ts`
- Modify: `app/api/meta/connection/route.ts:24-52`
- Modify: `app/privacy/page.tsx:10-24`
- Modify: `docs/meta-app-review.md:82-132`
- Modify: `README.md`

**Interfaces:**
- Consumes: participant persistence and expanded webhook subscription list.
- Produces: complete participant cleanup and reviewer instructions for follower verification.

- [ ] **Step 1: Add failing deletion tests**

Seed participants and assert user-initiated disconnect and deauthorization transition every non-terminal participant for that Instagram account to `EXPIRED` with a visible reason before deleting the token-bearing connection. Assert Meta data deletion removes all participant rows for affected workspaces. Assert unrelated workspaces remain unchanged.

- [ ] **Step 2: Run and verify failure**

Run: `pnpm vitest run src/lib/meta/deauthorization.test.ts src/lib/meta/data-deletion.test.ts`

Expected: FAIL until participant cleanup is included.

- [ ] **Step 3: Update deletion transactions**

For user-initiated disconnect and deauthorization, call `expireParticipantsByInstagramAccount` before deleting the connection. For Meta data deletion, delete participant rows before automation/connection rows in the explicit transaction even though cascade exists, so behavior is visible and testable. Match both behaviors in memory mode.

```ts
await repository.expireParticipantsByInstagramAccount(igUserId, "Instagram account disconnected");
await repository.deleteConnectionByInstagramAccount(igUserId);
```

```ts
await transaction.automationParticipant.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
await transaction.automationExecution.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
```

- [ ] **Step 4: Update privacy disclosures**

State that ReplyConnect stores Instagram-scoped participant identifiers, source media/comment IDs, interaction/delivery timestamps, and the latest follow-status result solely to run configured automations and prevent duplicate delivery.

```tsx
<p>For comment-to-message automations, we store the Instagram-scoped participant identifier, source comment and media identifiers, interaction and delivery timestamps, and the latest follow-status result needed to enforce your configured follow gate and prevent duplicate delivery.</p>
```

- [ ] **Step 5: Replace the old App Review flow**

Document the exact `guide` comment test, opening interaction, false-follow prompt, follow action, `I've followed` recheck, successful link delivery, five webhook fields, three permissions, reviewer credentials, and screencast sequence. Remove the statement that follower-to-DM automation is excluded.

- [ ] **Step 6: Run documentation and deletion checks**

Run: `pnpm vitest run src/lib/meta/deauthorization.test.ts src/lib/meta/data-deletion.test.ts && pnpm check:branding`

- [ ] **Step 7: Commit compliance changes**

```bash
git add src/lib/prisma.ts src/lib/memory-repository.ts src/lib/meta/deauthorization.ts src/lib/meta/deauthorization.test.ts src/lib/meta/data-deletion.test.ts app/api/meta/connection/route.ts app/privacy/page.tsx docs/meta-app-review.md README.md
git commit -m "docs: cover follow-gated campaign data"
```

---

### Task 11: End-to-End Verification and Isolated Deployment

**Files:**
- Modify: `e2e/smoke.spec.ts`
- Modify: `ops/COOLIFY_DEPLOYMENT.md`
- Modify: `.env.production.example`

**Interfaces:**
- Verifies all prior tasks as one deployed ReplyConnect flow.

- [ ] **Step 1: Extend Playwright smoke coverage**

Mock `/api/meta/media`, create a version 2 campaign through the visual builder, select a Reel, configure `guide`, review the follow gate, save it, and verify the automation appears in the list with an Activity link.

```ts
const reelFixture = {
  id: "media_1", caption: "Test Reel", mediaType: "VIDEO", mediaProductType: "REELS",
  permalink: "https://www.instagram.com/reel/demo/", thumbnailUrl: "https://cdn.example/reel.jpg",
  timestamp: "2026-08-21T00:00:00.000Z",
};
await page.route("**/api/meta/media", (route) => route.fulfill({ json: { data: [reelFixture], paging: {} } }));
await page.getByRole("link", { name: "New automation" }).click();
await page.getByRole("checkbox", { name: /test reel/i }).check();
await page.getByLabel("Keywords").fill("guide");
await page.getByRole("button", { name: "Save draft" }).click();
await expect(page.getByRole("link", { name: /activity/i })).toBeVisible();
```

- [ ] **Step 2: Run the complete local quality gate**

Run:

```bash
pnpm test
pnpm lint
pnpm check:branding
pnpm check:compose
pnpm build
pnpm test:e2e
```

Expected: every command exits 0.

- [ ] **Step 3: Verify the migration against a disposable PostgreSQL database**

Apply `pnpm db:migrate:deploy`, inspect the `AutomationParticipant` indexes, run the repository integration tests, and drop only the disposable database created for this verification.

- [ ] **Step 4: Commit verification assets**

```bash
git add e2e/smoke.spec.ts ops/COOLIFY_DEPLOYMENT.md .env.production.example
git commit -m "test: cover follow-gated campaign flow"
```

- [ ] **Step 5: Push ReplyConnect only**

Run: `git status --short && git log --oneline --decorate -12 && git push origin main`

Expected: clean worktree and push updates only `tejastelkar/replyconnect`.

- [ ] **Step 6: Deploy only the ReplyConnect Coolify service**

Trigger deployment for ReplyConnect service UUID `alzmminzroqpaftmprqt6lny`. Do not open, redeploy, restart, or mutate the TrackParcel project. Confirm web and worker containers use the new image and the migration completes.

- [ ] **Step 7: Reconnect the tester account if subscription fields are stale**

Reconnect through ReplyConnect OAuth so `subscribeToWebhooks` applies all five fields. In Meta's dashboard, confirm the app-level fields match the same list. Keep `FOLLOW_GATED_CAMPAIGNS_ENABLED=false` until the connection and subscription checks pass, then set it to `true` only on the ReplyConnect web and worker services and redeploy ReplyConnect.

- [ ] **Step 8: Run the live Meta acceptance flow**

Use one connected professional tester account and one separate commenter account:

1. Select an existing test Reel and activate the `guide` campaign.
2. Comment `guide` from the second account.
3. Confirm the public reply and one opening private reply.
4. Tap the opening interaction to establish consent.
5. Confirm a non-follower receives the follow prompt and no protected URL.
6. Follow the professional account and tap `I've followed`.
7. Confirm Meta returns true and ReplyConnect sends the protected link once.
8. Replay the webhook and confirm no duplicate public reply, opener, or link.

- [ ] **Step 9: Capture App Review evidence**

Record one uninterrupted screencast showing campaign setup, Reel selection, comment, opt-in, follow check, and final delivery. Record the reviewer login path and exact expected messages in `docs/meta-app-review.md` without storing passwords or access tokens in Git.

- [ ] **Step 10: Final production checks**

Verify `/api/health`, `/privacy`, `/terms`, `/data-deletion`, `/support`, media loading, activity loading, worker logs, and database participant state. Confirm TrackParcel remains healthy and unchanged through read-only status checks.
