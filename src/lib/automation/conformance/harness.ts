/**
 * Drives the real Instagram/Facebook automation path end to end:
 *
 *   signed webhook POST -> route -> normalizer -> queue producer (fake BullMQ)
 *   -> src/worker.ts dispatch -> runners -> outbound ledger -> MetaClient
 *   -> fetch (FakeMeta)
 *
 * Each conformance test file mocks bullmq, ioredis, the env, the worker's
 * health server/background scheduler and the plan lookup (see the preamble at
 * the top of every *.test.ts here), then uses these helpers.
 */
import { createHmac } from "node:crypto";
import { vi } from "vitest";
import { createMemoryRepository } from "../../memory-repository";
import { sealSecret } from "../../security/secrets";
import type { AutomationRecord, AutomationRepository, CreateAutomationInput } from "../../repository";
import type { FlowDefinition } from "../types";
import {
  backgroundStore,
  DelayedError,
  envOverrides,
  FACEBOOK_APP_SECRET,
  fakeMeta,
  META_APP_SECRET,
  planStore,
  queueStore,
  redisStore,
  sessionStore,
  TOKEN_KEY,
  type FakeJob,
} from "./fakes";

export const WORKSPACE_ID = "workspace_conformance";
export const OWNER_USER_ID = "user_owner";
export const OWNER_EMAIL = "owner@studio.test";
export const IG_ACCOUNT = "17841400000000001";
export const IG_USERNAME = "studio.kavya";
export const PAGE_ID = "104000000000001";

let personCounter = 0;
/** A fresh Instagram-scoped user id per call, so scenarios never collide. */
export function person(): string {
  personCounter += 1;
  return `9${String(personCounter).padStart(15, "0")}`;
}

let idCounter = 0;
export function uniqueId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}_${Date.now()}`;
}

let workerBooted = false;

/** Fresh repository, empty queues and Meta, default plan - one per scenario. */
export async function resetWorld(): Promise<AutomationRepository> {
  if (!workerBooted) {
    // Loads src/worker.ts for real: it registers its job processors with the
    // (fake) BullMQ Worker and its sweeps with the (captured) scheduler.
    await import("@/src/worker");
    workerBooted = true;
  }
  const repository = createMemoryRepository();
  (globalThis as { linkarRepository?: AutomationRepository }).linkarRepository = repository;
  queueStore.reset();
  redisStore.reset();
  fakeMeta.reset();
  for (const key of Object.keys(envOverrides)) delete envOverrides[key];
  sessionStore.session = { userId: OWNER_USER_ID, email: OWNER_EMAIL, workspaceId: WORKSPACE_ID };
  vi.stubGlobal("fetch", fakeMeta.fetch);
  const { resetNotificationDedupeForTests } = await import("../../notifications");
  resetNotificationDedupeForTests();
  await setMonthlyDeliveryLimit(null);
  return repository;
}

/** The plan's monthly message allowance for the scenario (null = unlimited). */
export async function setMonthlyDeliveryLimit(limit: number | null): Promise<void> {
  planStore.monthlyDeliveryLimit = limit;
  const { getEntitlementService } = await import("../../entitlements/service");
  getEntitlementService().invalidateWorkspace(WORKSPACE_ID);
}

export async function seedWorkspace(repository: AutomationRepository): Promise<void> {
  await repository.ensureWorkspace(WORKSPACE_ID, OWNER_EMAIL, OWNER_USER_ID);
  await repository.upsertConnection({
    workspaceId: WORKSPACE_ID,
    igUserId: IG_ACCOUNT,
    username: IG_USERNAME,
    accessTokenEncrypted: sealSecret("ig-access-token", TOKEN_KEY),
    status: "CONNECTED",
  });
}

export async function seedFacebookPage(repository: AutomationRepository): Promise<void> {
  await repository.upsertFacebookPage({
    workspaceId: WORKSPACE_ID,
    pageId: PAGE_ID,
    pageName: "Studio Kavya",
    accessTokenEncrypted: sealSecret("fb-page-token", TOKEN_KEY),
    status: "CONNECTED",
  });
}

/** An ACTIVE automation pinned to the connected account, as activation leaves it. */
export async function addAutomation(
  repository: AutomationRepository,
  name: string,
  definition: FlowDefinition,
  extra: Partial<CreateAutomationInput> = {},
): Promise<AutomationRecord> {
  return repository.createAutomation(WORKSPACE_ID, {
    provider: "INSTAGRAM",
    name,
    definition,
    status: "ACTIVE",
    instagramAccountId: IG_ACCOUNT,
    activatedAt: new Date(Date.now() - 60_000).toISOString(),
    ...extra,
  });
}

// ---------------------------------------------------------------------------
// Webhooks (Meta's documented payload shapes)
// ---------------------------------------------------------------------------

function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export async function postInstagramWebhook(payload: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/meta/webhook/route");
  const body = JSON.stringify(payload);
  return POST(new Request("https://app.linkar.test/api/meta/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sign(body, META_APP_SECRET) },
    body,
  }));
}

export async function postFacebookWebhook(payload: unknown): Promise<Response> {
  const { POST } = await import("@/app/api/facebook/webhook/route");
  const body = JSON.stringify(payload);
  return POST(new Request("https://app.linkar.test/api/facebook/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-hub-signature-256": sign(body, FACEBOOK_APP_SECRET) },
    body,
  }));
}

function seconds(ms: number): number {
  return Math.floor(ms / 1_000);
}

export type CommentInput = {
  from: string;
  username?: string;
  text: string;
  mediaId?: string;
  commentId?: string;
  parentId?: string;
  at?: number;
  account?: string;
};

/** `comments` change on the instagram object. */
export function commentPayload(input: CommentInput) {
  const at = input.at ?? Date.now();
  const commentId = input.commentId ?? uniqueId("comment");
  fakeMeta.commentAuthors.set(commentId, input.from);
  return {
    object: "instagram",
    entry: [{
      id: input.account ?? IG_ACCOUNT,
      time: seconds(at),
      changes: [{
        field: "comments",
        value: {
          from: { id: input.from, username: input.username ?? `user_${input.from}` },
          media: { id: input.mediaId ?? "media_1", media_product_type: "FEED" },
          id: commentId,
          ...(input.parentId ? { parent_id: input.parentId } : {}),
          text: input.text,
        },
      }],
    }],
  };
}

function messagingPayload(item: Record<string, unknown>, at: number, account = IG_ACCOUNT) {
  return { object: "instagram", entry: [{ id: account, time: at, messaging: [{ ...item, timestamp: at }] }] };
}

export function messagePayload(input: {
  from: string;
  text?: string;
  mid?: string;
  at?: number;
  quickReplyPayload?: string;
  storyId?: string;
  attachments?: unknown[];
}) {
  const at = input.at ?? Date.now();
  return messagingPayload({
    sender: { id: input.from },
    recipient: { id: IG_ACCOUNT },
    message: {
      mid: input.mid ?? uniqueId("mid"),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.quickReplyPayload !== undefined ? { quick_reply: { payload: input.quickReplyPayload } } : {}),
      ...(input.storyId ? { reply_to: { story: { id: input.storyId, url: "https://lookaside.fbsbx.com/story" } } } : {}),
      ...(input.attachments ? { attachments: input.attachments } : {}),
    },
  }, at);
}

export function storyMentionPayload(input: { from: string; storyId?: string; at?: number }) {
  return messagePayload({
    from: input.from,
    at: input.at,
    attachments: [{
      type: "story_mention",
      payload: { url: "https://lookaside.fbsbx.com/ig_messaging_cdn/story", story: { id: input.storyId ?? uniqueId("story") } },
    }],
  });
}

export function postbackPayload(input: { from: string; payload: string; title?: string; at?: number }) {
  const at = input.at ?? Date.now();
  return messagingPayload({
    sender: { id: input.from },
    recipient: { id: IG_ACCOUNT },
    postback: { mid: uniqueId("postback"), title: input.title ?? "Tap", payload: input.payload },
  }, at);
}

export function referralPayload(input: { from: string; ref?: string; at?: number }) {
  const at = input.at ?? Date.now();
  return messagingPayload({
    sender: { id: input.from },
    recipient: { id: IG_ACCOUNT },
    referral: { ref: input.ref ?? "spring_ad", source: "ADS", type: "OPEN_THREAD" },
  }, at);
}

export function optinPayload(input: { from: string; ref?: string; at?: number }) {
  const at = input.at ?? Date.now();
  return messagingPayload({
    sender: { id: input.from },
    recipient: { id: IG_ACCOUNT },
    optin: { ref: input.ref ?? "newsletter", type: "notification_messages" },
  }, at);
}

/** What Meta sends for a message the account itself sent (Instagram app, Linkar inbox, automations). */
export function echoPayload(input: { to: string; text: string; mid?: string; at?: number }) {
  const at = input.at ?? Date.now();
  return messagingPayload({
    sender: { id: IG_ACCOUNT },
    recipient: { id: input.to },
    message: { mid: input.mid ?? uniqueId("echo"), text: input.text, is_echo: true },
  }, at);
}

export function facebookCommentPayload(input: { from: string; name?: string; text: string; postId?: string; commentId?: string; at?: number; fromPage?: boolean }) {
  const at = input.at ?? Date.now();
  const postId = input.postId ?? `${PAGE_ID}_post1`;
  return {
    object: "page",
    entry: [{
      id: PAGE_ID,
      time: seconds(at),
      changes: [{
        field: "feed",
        value: {
          item: "comment",
          verb: "add",
          comment_id: input.commentId ?? uniqueId(`${postId}_c`),
          post_id: postId,
          parent_id: postId,
          message: input.text,
          from: { id: input.fromPage ? PAGE_ID : input.from, name: input.name ?? "Asha Rao" },
          created_time: seconds(at),
        },
      }],
    }],
  };
}

// ---------------------------------------------------------------------------
// Queue draining (what the worker process would do)
// ---------------------------------------------------------------------------

export type DrainReport = { completed: FakeJob[]; failed: FakeJob[]; deferred: FakeJob[] };

/**
 * Runs every job that is due at Date.now() through the worker's real
 * processor, BullMQ-style: thrown errors retry until `attempts` is spent, and
 * a DelayedError (send deferral) parks the job. Retries are run immediately -
 * the configured backoff is left on the job for assertions.
 */
export async function drain(options: { maxRuns?: number } = {}): Promise<DrainReport> {
  const report: DrainReport = { completed: [], failed: [], deferred: [] };
  const maxRuns = options.maxRuns ?? 200;
  for (let runs = 0; runs < maxRuns; runs += 1) {
    const now = Date.now();
    const due = [...queueStore.jobs.values()]
      .filter((job) => (job.state === "waiting" || job.state === "delayed") && job.processAt <= now)
      .sort((a, b) => (a.opts.priority ?? 0) - (b.opts.priority ?? 0) || a.processAt - b.processAt);
    const job = due[0];
    if (!job) break;
    const processor = queueStore.processors.get(job.queueName);
    if (!processor) throw new Error(`No worker registered for ${job.queueName}`);
    job.state = "waiting";
    try {
      job.returnvalue = await processor(job, "conformance-token");
      job.state = "completed";
      job.finishedOn = Date.now();
      report.completed.push(job);
    } catch (error) {
      if (error instanceof DelayedError) {
        report.deferred.push(job);
        continue;
      }
      job.attemptsMade += 1;
      job.errors.push(error instanceof Error ? error.message : String(error));
      if (job.attemptsMade >= Number(job.opts.attempts ?? 1)) {
        job.state = "failed";
        job.failedReason = job.errors.at(-1);
        job.finishedOn = Date.now();
        report.failed.push(job);
      } else {
        job.state = "waiting";
        job.processAt = Date.now();
      }
    }
  }
  return report;
}

/** Post a webhook and run the resulting jobs, like Meta -> Linkar -> worker. */
export async function deliverInstagram(payload: unknown): Promise<DrainReport> {
  const response = await postInstagramWebhook(payload);
  if (response.status !== 200) throw new Error(`Instagram webhook answered ${response.status}`);
  return drain();
}

export async function deliverFacebook(payload: unknown): Promise<DrainReport> {
  const response = await postFacebookWebhook(payload);
  if (response.status !== 200) throw new Error(`Facebook webhook answered ${response.status}`);
  return drain();
}

/** Runs one of the worker's periodic sweeps (captured from createBackgroundTasks). */
export async function runSweep(label: string): Promise<unknown> {
  const task = backgroundStore.tasks.get(label);
  if (!task) throw new Error(`No background task named "${label}"`);
  return task();
}

export function queuedJobs(name?: string): FakeJob[] {
  return [...queueStore.jobs.values()].filter((job) => !name || job.name === name);
}

/** Runs async work the runners fire and forget (activity rows, notifications). */
export async function settle(): Promise<void> {
  for (let index = 0; index < 5; index += 1) await new Promise((resolve) => setImmediate(resolve));
}
