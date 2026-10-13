/**
 * Test doubles for the automation conformance suite. Only the outside world is
 * faked here - Meta's Graph API (via fetch), Redis and BullMQ - so every
 * scenario still runs the real webhook route, queue producers, worker
 * dispatch, runners, outbound ledger and memory repository.
 *
 * This module must not import application code: it is loaded from vi.mock
 * factories, before the modules it stands in for are resolved.
 */

// ---------------------------------------------------------------------------
// BullMQ
// ---------------------------------------------------------------------------

export type FakeJobState = "waiting" | "delayed" | "completed" | "failed";

export type FakeJob = {
  id: string;
  name: string;
  queueName: string;
  data: Record<string, unknown>;
  opts: Record<string, unknown> & { attempts?: number; delay?: number; priority?: number; backoff?: unknown };
  attemptsMade: number;
  timestamp: number;
  processAt: number;
  state: FakeJobState;
  failedReason?: string;
  finishedOn?: number;
  returnvalue?: unknown;
  /** Every failure the job hit, in order (retries included). */
  errors: string[];
  moveToDelayed(timestamp: number, token?: string): Promise<void>;
  remove(): Promise<void>;
  getState(): Promise<string>;
  retry(): Promise<void>;
};

type Processor = (job: FakeJob, token?: string) => Promise<unknown>;

export const queueStore = {
  jobs: new Map<string, FakeJob>(),
  processors: new Map<string, Processor>(),
  sequence: 0,
  reset() {
    this.jobs.clear();
    this.sequence = 0;
  },
};

export class DelayedError extends Error {
  constructor(message = "DelayedError") {
    super(message);
    this.name = "DelayedError";
  }
}

function jobKey(queueName: string, id: string): string {
  return `${queueName}\0${id}`;
}

export class Queue {
  readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  async add(name: string, data: Record<string, unknown>, opts: FakeJob["opts"] = {}): Promise<FakeJob> {
    queueStore.sequence += 1;
    const id = typeof opts.jobId === "string" ? opts.jobId : `job_${queueStore.sequence}`;
    const key = jobKey(this.name, id);
    // BullMQ ignores an add whose jobId already exists - that is the dedupe
    // contract the webhook producers rely on.
    const existing = queueStore.jobs.get(key);
    if (existing) return existing;
    const now = Date.now();
    const delay = typeof opts.delay === "number" ? opts.delay : 0;
    const job: FakeJob = {
      id,
      name,
      queueName: this.name,
      data: structuredClone(data),
      opts: { ...opts },
      attemptsMade: 0,
      timestamp: now,
      processAt: now + delay,
      state: delay > 0 ? "delayed" : "waiting",
      errors: [],
      async moveToDelayed(timestamp: number) {
        job.state = "delayed";
        job.processAt = timestamp;
      },
      async remove() {
        queueStore.jobs.delete(key);
      },
      async getState() {
        return job.state;
      },
      async retry() {
        job.state = "waiting";
        job.processAt = Date.now();
      },
    };
    queueStore.jobs.set(key, job);
    return job;
  }

  async getJob(id: string): Promise<FakeJob | undefined> {
    return queueStore.jobs.get(jobKey(this.name, id));
  }

  async getJobs(states: string[] = [], start = 0, end = -1): Promise<FakeJob[]> {
    const wanted = new Set(states.map((state) => (state === "prioritized" ? "waiting" : state)));
    const jobs = [...queueStore.jobs.values()].filter((job) =>
      job.queueName === this.name && (wanted.size === 0 || wanted.has(job.state)));
    return end < 0 ? jobs.slice(start) : jobs.slice(start, end + 1);
  }

  async getJobCounts(...states: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const state of states) counts[state] = 0;
    for (const job of queueStore.jobs.values()) {
      if (job.queueName !== this.name) continue;
      counts[job.state] = (counts[job.state] ?? 0) + 1;
    }
    return counts;
  }

  async isPaused() { return false; }
  async pause() {}
  async resume() {}
  async close() {}
}

export class Worker {
  constructor(name: string, processor: Processor) {
    queueStore.processors.set(name, processor);
  }
  on() { return this; }
  isRunning() { return true; }
  isPaused() { return false; }
  async waitUntilReady() {}
  async close() {}
}

export const bullmqModule = { Queue, Worker, DelayedError };

// ---------------------------------------------------------------------------
// ioredis (only the send-rate limiter's admit script is exercised)
// ---------------------------------------------------------------------------

export const redisStore = {
  counters: new Map<string, number>(),
  /** When set, every eval throws - simulates Redis being unreachable. */
  down: false,
  reset() {
    this.counters.clear();
    this.down = false;
  },
};

export class FakeRedis {
  status = "ready";
  on() { return this; }
  disconnect() {}
  async quit() { return "OK"; }
  async eval(_script: string, _keys: number, key: string, ceiling: number | string): Promise<number> {
    if (redisStore.down) throw new Error("Redis connection refused");
    const current = redisStore.counters.get(key) ?? 0;
    if (current >= Number(ceiling)) return 0;
    redisStore.counters.set(key, current + 1);
    return 1;
  }
}

export const ioredisModule = { default: FakeRedis };

// ---------------------------------------------------------------------------
// Worker periodic sweeps: captured so a scenario can run one on demand.
// ---------------------------------------------------------------------------

export const backgroundStore = {
  tasks: new Map<string, () => Promise<unknown>>(),
};

export const backgroundTasksModule = {
  createBackgroundTasks() {
    return {
      every(label: string, _intervalMs: number, task: () => Promise<unknown>) {
        backgroundStore.tasks.set(label, task);
      },
      async stop() { return true; },
    };
  },
};

// ---------------------------------------------------------------------------
// Meta Graph API (graph.instagram.com + graph.facebook.com) via fetch
// ---------------------------------------------------------------------------

export type MetaCallKind =
  | "private_reply"
  | "direct_message"
  | "public_reply"
  | "follow_check"
  | "profile"
  | "media"
  | "facebook_comment_reply"
  | "other_meta"
  | "external";

export type MetaCall = {
  kind: MetaCallKind;
  method: string;
  host: string;
  path: string;
  query: Record<string, string>;
  body?: Record<string, unknown>;
  /** Convenience views of a messaging send. */
  recipient?: { id?: string; comment_id?: string };
  text?: string;
  buttons?: Array<Record<string, unknown>>;
  quickReplies?: Array<Record<string, unknown>>;
  attachmentType?: string;
};

export type MetaFailure = {
  match: (call: MetaCall) => boolean;
  status: number;
  error?: { message: string; code?: number; error_subcode?: number; is_transient?: boolean; type?: string };
  /** Throw at the network layer instead of answering (ambiguous outcome). */
  network?: boolean;
  times: number;
};

function classify(method: string, host: string, path: string, query: Record<string, string>, body?: Record<string, unknown>): MetaCallKind {
  if (host === "graph.facebook.com") {
    return method === "POST" && path.endsWith("/comments") ? "facebook_comment_reply" : "other_meta";
  }
  if (host !== "graph.instagram.com") return "external";
  if (method === "POST" && path.endsWith("/replies")) return "public_reply";
  if (method === "POST" && path.endsWith("/messages")) {
    const recipient = body?.recipient as { comment_id?: string } | undefined;
    return recipient?.comment_id ? "private_reply" : "direct_message";
  }
  if (method === "GET" && query.fields === "is_user_follow_business") return "follow_check";
  if (method === "GET" && query.fields === "username,profile_pic") return "profile";
  if (method === "GET" && query.fields?.includes("media_type")) return "media";
  return "other_meta";
}

export class FakeMeta {
  calls: MetaCall[] = [];
  /** igsid -> follows the business account. */
  follows = new Map<string, boolean>();
  /** comment id -> commenter igsid (what Meta returns as a private reply's recipient_id). */
  commentAuthors = new Map<string, string>();
  media = new Map<string, Record<string, unknown>>();
  failures: MetaFailure[] = [];
  private messageCounter = 0;

  reset() {
    this.calls = [];
    this.follows.clear();
    this.commentAuthors.clear();
    this.media.clear();
    this.failures = [];
    this.messageCounter = 0;
  }

  /** Makes the next `times` matching calls fail with a Graph error. */
  fail(match: (call: MetaCall) => boolean, failure: Omit<MetaFailure, "match" | "times"> & { times?: number }) {
    this.failures.push({ match, times: failure.times ?? 1, ...failure });
  }

  sends(): MetaCall[] {
    return this.calls.filter((call) =>
      call.kind === "private_reply" || call.kind === "direct_message" || call.kind === "public_reply"
      || call.kind === "facebook_comment_reply");
  }

  fetch = async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    const query = Object.fromEntries(url.searchParams.entries());
    let body: Record<string, unknown> | undefined;
    if (typeof init.body === "string") {
      try { body = JSON.parse(init.body) as Record<string, unknown>; } catch { body = { raw: init.body }; }
    }
    const kind = classify(method, url.hostname, url.pathname, query, body);
    const message = body?.message as Record<string, unknown> | undefined;
    const attachment = message?.attachment as { type?: string; payload?: Record<string, unknown> } | undefined;
    const call: MetaCall = {
      kind,
      method,
      host: url.hostname,
      path: url.pathname,
      query,
      body,
      ...(body?.recipient ? { recipient: body.recipient as MetaCall["recipient"] } : {}),
      ...(typeof message?.text === "string"
        ? { text: message.text }
        : typeof attachment?.payload?.text === "string"
          ? { text: attachment.payload.text as string }
          : typeof body?.message === "string" ? { text: body.message } : {}),
      ...(Array.isArray(attachment?.payload?.buttons) ? { buttons: attachment!.payload!.buttons as Array<Record<string, unknown>> } : {}),
      ...(Array.isArray(message?.quick_replies) ? { quickReplies: message!.quick_replies as Array<Record<string, unknown>> } : {}),
      ...(attachment?.type ? { attachmentType: attachment.type } : {}),
    };
    this.calls.push(call);

    const failure = this.failures.find((candidate) => candidate.times > 0 && candidate.match(call));
    if (failure) {
      failure.times -= 1;
      if (failure.network) throw new TypeError("fetch failed");
      return Response.json({ error: { type: "OAuthException", ...failure.error } }, { status: failure.status });
    }

    if (kind === "external") return Response.json({ ok: true });
    if (kind === "public_reply" || kind === "facebook_comment_reply") {
      this.messageCounter += 1;
      return Response.json({ id: `reply_${this.messageCounter}` });
    }
    if (kind === "private_reply" || kind === "direct_message") {
      this.messageCounter += 1;
      const recipient = call.recipient ?? {};
      const recipientId = recipient.id ?? (recipient.comment_id ? this.commentAuthors.get(recipient.comment_id) : undefined);
      return Response.json({
        ...(recipientId ? { recipient_id: recipientId } : {}),
        message_id: `mid_${this.messageCounter}`,
      });
    }
    if (kind === "follow_check") {
      const igsid = url.pathname.split("/").at(-1)!;
      return Response.json({ id: igsid, is_user_follow_business: this.follows.get(igsid) ?? false });
    }
    if (kind === "profile") {
      const igsid = url.pathname.split("/").at(-1)!;
      return Response.json({ id: igsid, username: `user_${igsid}` });
    }
    if (kind === "media") {
      const mediaId = url.pathname.split("/").at(-1)!;
      const media = this.media.get(mediaId);
      if (!media) {
        return Response.json({ error: { message: "Unsupported get request", code: 100, error_subcode: 33 } }, { status: 400 });
      }
      return Response.json(media);
    }
    return Response.json({ success: true });
  };
}

export const fakeMeta = new FakeMeta();

// ---------------------------------------------------------------------------
// Runtime configuration the worker and routes read through getServerEnv()
// ---------------------------------------------------------------------------

export const TOKEN_KEY = "0123456789abcdef".repeat(4);
export const META_APP_SECRET = "conformance-meta-app-secret";
export const FACEBOOK_APP_SECRET = "conformance-facebook-app-secret";
export const APP_URL = "https://app.linkar.test";

/** Per-scenario env tweaks (e.g. a tiny send-rate ceiling). */
export const envOverrides: Record<string, unknown> = {};

/** Overlays a working Meta + Redis configuration on the real (demo) env. */
export function conformanceEnv<T extends object>(base: T): T {
  return {
    ...base,
    appUrl: APP_URL,
    redisUrl: "redis://conformance.invalid:6379",
    metaAppId: "conformance-meta-app",
    metaAppSecret: META_APP_SECRET,
    metaTokenEncryptionKey: TOKEN_KEY,
    metaApiVersion: "v25.0",
    facebookAppId: "conformance-facebook-app",
    facebookAppSecret: FACEBOOK_APP_SECRET,
    facebookTokenEncryptionKey: TOKEN_KEY,
    facebookApiVersion: "v25.0",
    followGatedCampaignsEnabled: true,
    dispatchLeaseMs: 30_000,
    providerRequestTimeoutMs: 5_000,
    workerConcurrency: 1,
    ...envOverrides,
  };
}

/** The workspace plan's monthly delivery allowance (null = unlimited). */
export const planStore = { monthlyDeliveryLimit: null as number | null };

/** The signed-in teammate for routes that need a session. */
export const sessionStore = {
  session: null as { userId: string; email: string; workspaceId: string } | null,
};
