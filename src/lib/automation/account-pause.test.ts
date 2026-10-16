import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Shared by every FakeRedis instance, like one Redis server seen by the web container and the worker. */
const redisServer = vi.hoisted(() => ({
  values: new Map<string, { value: string; expiresAt: number | null }>(),
  down: false,
}));
const notify = vi.hoisted(() => vi.fn(async () => true));
const warn = vi.hoisted(() => vi.fn());

const FakeRedis = vi.hoisted(() => {
  return class FakeRedis {
    on() { return this; }

    private live(key: string) {
      const entry = redisServer.values.get(key);
      if (!entry) return undefined;
      if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
        redisServer.values.delete(key);
        return undefined;
      }
      return entry;
    }

    private check() {
      if (redisServer.down) throw new Error("Redis connection refused");
    }

    async get(key: string) {
      this.check();
      return this.live(key)?.value ?? null;
    }

    async mget(...keys: string[]) {
      this.check();
      return keys.map((key) => this.live(key)?.value ?? null);
    }

    async set(key: string, value: string, ...args: Array<string | number>) {
      this.check();
      if (args.includes("NX") && this.live(key)) return null;
      const pxAt = args.indexOf("PX");
      const expiresAt = pxAt >= 0 ? Date.now() + Number(args[pxAt + 1]) : null;
      redisServer.values.set(key, { value, expiresAt });
      return "OK";
    }

    async incr(key: string) {
      this.check();
      const entry = this.live(key);
      const next = Number(entry?.value ?? 0) + 1;
      redisServer.values.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    }

    async decr(key: string) {
      this.check();
      const entry = this.live(key);
      const next = Number(entry?.value ?? 0) - 1;
      redisServer.values.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
      return next;
    }

    async pexpire(key: string, ms: number) {
      this.check();
      const entry = this.live(key);
      if (entry) entry.expiresAt = Date.now() + ms;
      return entry ? 1 : 0;
    }
  };
});

vi.mock("ioredis", () => ({ default: FakeRedis }));
vi.mock("../notifications", () => ({ notifyWorkspaceManagers: notify }));
vi.mock("../logger", () => ({ logger: { warn, info: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

import { createMemoryRepository } from "../memory-repository";
import { parseAccountPauseReason } from "../meta/errors";
import {
  THROTTLE_PAUSE_MS,
  alertOwnersOfAccountPause,
  checkAccountSendGate,
  heldSendReason,
  pauseAccountAfterBlock,
  recordAccountBlock,
  recordAccountThrottle,
  recoveryHourlyLimit,
  resetAccountPauseStateForTests,
  throttleBackoffMs,
  type SendPauseTarget,
} from "./account-pause";

const HOUR = 60 * 60_000;
const START = Date.parse("2026-10-16T10:15:00.000Z");
const ACCOUNT: SendPauseTarget = { channel: "instagram", accountId: "ig_1" };
const OTHER: SendPauseTarget = { channel: "instagram", accountId: "ig_2" };
const PAGE: SendPauseTarget = { channel: "facebook", accountId: "page_1" };

const ENV_KEYS = [
  "REDIS_URL",
  "ACCOUNT_BLOCK_PAUSE_HOURS",
  "ACCOUNT_RECOVERY_HOURS",
  "ACCOUNT_RECOVERY_SEND_PERCENT",
  "DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR",
  "PRIVATE_REPLY_RATE_LIMIT_PER_HOUR",
] as const;
const savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

/** A second process (the web container next to the worker): same Redis, none of this process's memory. */
function asAnotherProcess() {
  resetAccountPauseStateForTests();
}

function at(time: number) {
  vi.setSystemTime(time);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(START);
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.REDIS_URL = "redis://localhost:6379";
  redisServer.values.clear();
  redisServer.down = false;
  delete (globalThis as { linkarAccountPauseRedis?: unknown }).linkarAccountPauseRedis;
  resetAccountPauseStateForTests();
  notify.mockClear();
  warn.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("account block pause", () => {
  it("lets sends through when nothing is paused", async () => {
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
  });

  it("blocks every send for the account for 24 hours by default, and only that account", async () => {
    const pause = await recordAccountBlock(ACCOUNT);
    expect(pause).toEqual({ until: START + 24 * HOUR, created: true });

    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "blocked", until: START + 24 * HOUR });
    for (const recovery of ["enforce", "count", "ignore"] as const) {
      await expect(checkAccountSendGate(ACCOUNT, { recovery })).resolves.toMatchObject({ status: "blocked" });
    }
    await expect(checkAccountSendGate(OTHER)).resolves.toEqual({ status: "open" });
    await expect(checkAccountSendGate({ channel: "facebook", accountId: "ig_1" })).resolves.toEqual({ status: "open" });
  });

  it("shares the pause through Redis, so the web container sees what the worker recorded", async () => {
    await recordAccountBlock(ACCOUNT);
    asAnotherProcess();
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "blocked" });
  });

  it("starts a pause once: later blocks join it and keep its end time", async () => {
    await recordAccountBlock(ACCOUNT);
    at(START + 2 * HOUR);
    await expect(recordAccountBlock(ACCOUNT)).resolves.toEqual({ until: START + 24 * HOUR, created: false });
    asAnotherProcess();
    await expect(recordAccountBlock(ACCOUNT)).resolves.toEqual({ until: START + 24 * HOUR, created: false });
  });

  it("uses ACCOUNT_BLOCK_PAUSE_HOURS for the length", async () => {
    process.env.ACCOUNT_BLOCK_PAUSE_HOURS = "48";
    await expect(recordAccountBlock(ACCOUNT)).resolves.toMatchObject({ until: START + 48 * HOUR });
  });

  it("still pauses the process that saw the block when Redis is down", async () => {
    redisServer.down = true;
    await expect(recordAccountBlock(ACCOUNT)).resolves.toEqual({ until: START + 24 * HOUR, created: true });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "blocked" });
    await expect(recordAccountBlock(ACCOUNT)).resolves.toMatchObject({ created: false });
    // Reported once a minute, not on every send.
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Account pause store unavailable"), expect.anything());
    at(START + 61_000);
    await checkAccountSendGate(ACCOUNT);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("keeps a pause this process recorded even if Redis loses it", async () => {
    await recordAccountBlock(ACCOUNT);
    redisServer.values.clear();
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "blocked" });
  });

  it("works in memory when Redis is not configured", async () => {
    delete process.env.REDIS_URL;
    await expect(recordAccountBlock(ACCOUNT)).resolves.toMatchObject({ created: true });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "blocked" });
  });
});

describe("recovery after a pause", () => {
  beforeEach(() => {
    // 25% of an 8-an-hour DM ceiling: 2 sends an hour while recovering.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "8";
  });

  it("runs on a reduced share of the hourly budget, then returns to normal", async () => {
    await recordAccountBlock(ACCOUNT);
    at(START + 24 * HOUR + 60_000);

    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    const held = await checkAccountSendGate(ACCOUNT);
    expect(held).toMatchObject({ status: "recovering" });
    // Until the next hour starts (10:16 now, so 44 minutes).
    expect(held.status === "recovering" && held.retryAfterMs).toBe(44 * 60_000);

    // A teammate's typed reply is neither limited by nor counted in the budget.
    await expect(checkAccountSendGate(ACCOUNT, { recovery: "ignore" })).resolves.toEqual({ status: "open" });

    // The next hour has a fresh share.
    at(START + 25 * HOUR);
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });

    // After the recovery hours the normal limits apply again.
    at(START + 48 * HOUR + 60_000);
    for (let index = 0; index < 5; index += 1) {
      await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    }
  });

  it("shares the recovery budget between processes", async () => {
    await recordAccountBlock(ACCOUNT);
    at(START + 24 * HOUR + 60_000);
    await checkAccountSendGate(ACCOUNT);
    asAnotherProcess();
    await checkAccountSendGate(ACCOUNT);
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "recovering" });
  });

  it("lets a counted send through over the budget, while it still uses up the share for the rest", async () => {
    await recordAccountBlock(ACCOUNT);
    at(START + 24 * HOUR + 60_000);
    for (let index = 0; index < 3; index += 1) {
      await expect(checkAccountSendGate(ACCOUNT, { recovery: "count" })).resolves.toEqual({ status: "open" });
    }
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "recovering" });
    // The same in another process, and with Redis down.
    asAnotherProcess();
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "recovering" });
    redisServer.down = true;
    asAnotherProcess();
    await recordAccountBlock(ACCOUNT, { now: START });
    for (let index = 0; index < 3; index += 1) {
      await expect(checkAccountSendGate(ACCOUNT, { recovery: "count" })).resolves.toEqual({ status: "open" });
    }
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "recovering" });
  });

  it("falls back to this process's count when Redis is down", async () => {
    await recordAccountBlock(ACCOUNT);
    at(START + 24 * HOUR + 60_000);
    redisServer.down = true;
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "recovering" });
  });

  it("resumes at the full budget when ACCOUNT_RECOVERY_HOURS is 0", async () => {
    process.env.ACCOUNT_RECOVERY_HOURS = "0";
    await recordAccountBlock(ACCOUNT);
    at(START + 24 * HOUR + 60_000);
    for (let index = 0; index < 5; index += 1) {
      await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    }
  });

  it("sizes the recovery budget from the DM ceiling, or the private-reply ceiling when DMs are uncapped", () => {
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "250";
    expect(recoveryHourlyLimit()).toBe(62);
    process.env.ACCOUNT_RECOVERY_SEND_PERCENT = "10";
    expect(recoveryHourlyLimit()).toBe(25);
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "0";
    expect(recoveryHourlyLimit()).toBe(40);
    process.env.PRIVATE_REPLY_RATE_LIMIT_PER_HOUR = "0";
    expect(recoveryHourlyLimit()).toBeNull();
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "3";
    expect(recoveryHourlyLimit()).toBe(1);
  });
});

describe("throttling cool-down", () => {
  it("waits 1, 5, then 15 minutes per throttled attempt", () => {
    expect([0, 1, 2, 3, 4, 10].map(throttleBackoffMs)).toEqual([
      60_000, 60_000, 5 * 60_000, 15 * 60_000, 15 * 60_000, 15 * 60_000,
    ]);
  });

  it("pauses the whole account for 15 minutes after three throttles in five minutes", async () => {
    await expect(recordAccountThrottle(ACCOUNT)).resolves.toEqual({ strikes: 1 });
    at(START + 60_000);
    await expect(recordAccountThrottle(ACCOUNT)).resolves.toEqual({ strikes: 2 });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
    at(START + 2 * 60_000);
    const third = await recordAccountThrottle(ACCOUNT);
    expect(third).toEqual({ strikes: 3, pausedUntil: START + 2 * 60_000 + THROTTLE_PAUSE_MS });

    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "throttled", until: third.pausedUntil });
    asAnotherProcess();
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "throttled" });
    await expect(checkAccountSendGate(OTHER)).resolves.toEqual({ status: "open" });

    at(third.pausedUntil! + 1);
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "open" });
  });

  it("forgets throttles once a full window passes without one", async () => {
    await recordAccountThrottle(ACCOUNT);
    await recordAccountThrottle(ACCOUNT);
    at(START + 6 * 60_000);
    await expect(recordAccountThrottle(ACCOUNT)).resolves.toEqual({ strikes: 1 });
  });

  it("counts throttles in this process when Redis is down", async () => {
    redisServer.down = true;
    await recordAccountThrottle(ACCOUNT);
    await recordAccountThrottle(ACCOUNT);
    await expect(recordAccountThrottle(ACCOUNT)).resolves.toMatchObject({ strikes: 3, pausedUntil: START + THROTTLE_PAUSE_MS });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "throttled" });
  });

  it("honours Meta's usage headers when the caller has them", async () => {
    await expect(recordAccountThrottle(ACCOUNT, { usage: { highestPercent: 40, regainAccessMs: 20 * 60_000 } }))
      .resolves.toEqual({ strikes: 1, pausedUntil: START + 20 * 60_000 });
    // Meta's estimate is honoured up to an hour.
    await expect(recordAccountThrottle(OTHER, { usage: { highestPercent: 100, regainAccessMs: 5 * HOUR } }))
      .resolves.toEqual({ strikes: 1, pausedUntil: START + HOUR });
    // A counter at 100% with no estimate pauses for the usual cool-down.
    await expect(recordAccountThrottle(PAGE, { usage: { highestPercent: 100, regainAccessMs: 0 } }))
      .resolves.toEqual({ strikes: 1, pausedUntil: START + THROTTLE_PAUSE_MS });
    // Headers below the limit change nothing.
    await expect(recordAccountThrottle({ channel: "instagram", accountId: "ig_3" }, { usage: { highestPercent: 70, regainAccessMs: 0 } }))
      .resolves.toEqual({ strikes: 1 });
  });

  it("never shortens a running cool-down", async () => {
    await recordAccountThrottle(ACCOUNT, { usage: { highestPercent: 100, regainAccessMs: 40 * 60_000 } });
    await recordAccountThrottle(ACCOUNT, { usage: { highestPercent: 100, regainAccessMs: 0 } });
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "throttled", until: START + 40 * 60_000 });
    asAnotherProcess();
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toEqual({ status: "throttled", until: START + 40 * 60_000 });
  });

  it("reports a block before a throttle", async () => {
    await recordAccountThrottle(ACCOUNT, { usage: { highestPercent: 100, regainAccessMs: 0 } });
    await recordAccountBlock(ACCOUNT);
    await expect(checkAccountSendGate(ACCOUNT)).resolves.toMatchObject({ status: "blocked" });
  });
});

describe("owner alert", () => {
  async function seededRepository() {
    const repository = createMemoryRepository();
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "studio.kavya",
      accessTokenEncrypted: "sealed",
      status: "CONNECTED",
    });
    await repository.upsertFacebookPage({
      workspaceId: "workspace_a",
      pageId: "page_1",
      pageName: "Studio Kavya",
      accessTokenEncrypted: "sealed",
      status: "CONNECTED",
    });
    return repository;
  }

  it("emails the owners once per pause, saying when replies restart", async () => {
    const repository = await seededRepository();
    const first = await pauseAccountAfterBlock(repository, ACCOUNT);
    expect(first).toMatchObject({ until: START + 24 * HOUR, created: true });
    expect(parseAccountPauseReason(first.reason)).toEqual({ platform: "Instagram", durationMs: 24 * HOUR });

    await vi.waitFor(() => expect(notify).toHaveBeenCalledOnce());
    const [workspaceId, dedupeKey, subject, body] = notify.mock.calls[0] as unknown as string[];
    expect(workspaceId).toBe("workspace_a");
    expect(dedupeKey).toBe(`account-send-paused:instagram:ig_1:${START + 24 * HOUR}`);
    expect(subject).toBe("Instagram has limited @studio.kavya");
    expect(body).toBe(
      "Instagram has limited @studio.kavya from sending messages. Linkar paused automatic replies on it until 17 Oct, 10:15 am UTC, and after that it restarts them slowly. You don't need to do anything in Linkar. If Instagram shows a warning in its app, you can review or appeal it there. Linkar can't appeal for you.",
    );
    expect(body).not.toMatch(/\u2014|payload|recipient|webhook/i);

    // More refused sends during the same pause do not email again.
    at(START + HOUR);
    const second = await pauseAccountAfterBlock(repository, ACCOUNT);
    expect(second).toMatchObject({ until: START + 24 * HOUR, created: false });
    expect(parseAccountPauseReason(second.reason)).toEqual({ platform: "Instagram", durationMs: 23 * HOUR });
    asAnotherProcess();
    await pauseAccountAfterBlock(repository, ACCOUNT);
    await Promise.resolve();
    expect(notify).toHaveBeenCalledOnce();
  });

  it("names a Facebook Page, and leaves out the slow restart when recovery is off", async () => {
    process.env.ACCOUNT_RECOVERY_HOURS = "0";
    const repository = await seededRepository();
    await alertOwnersOfAccountPause(repository, PAGE, START + 24 * HOUR);
    const [, , subject, body] = notify.mock.calls[0] as unknown as string[];
    expect(subject).toBe("Facebook has limited Studio Kavya");
    expect(body).toContain("Linkar paused automatic replies on it until 17 Oct, 10:15 am UTC. You don't need");
  });

  it("does nothing for an account no workspace owns, and never throws", async () => {
    const repository = createMemoryRepository();
    await expect(alertOwnersOfAccountPause(repository, OTHER, START + HOUR)).resolves.toBeUndefined();
    expect(notify).not.toHaveBeenCalled();

    const broken = { ...repository, findWorkspaceByInstagramAccount: vi.fn().mockRejectedValue(new Error("db down")) };
    await expect(alertOwnersOfAccountPause(broken, ACCOUNT, START + HOUR)).resolves.toBeUndefined();
  });

  it("writes the time left on each held send, to the minute", () => {
    expect(heldSendReason(ACCOUNT, START + 3 * HOUR + 12 * 60_000)).toBe(
      "Not sent. Instagram has limited this account, so Linkar paused sending from it for another 3 hours and 12 minutes.",
    );
    // Rounded up, so the restart time read back is never early, and never more than a minute late.
    expect(parseAccountPauseReason(heldSendReason(ACCOUNT, START + 3 * HOUR + 1))).toEqual({
      platform: "Instagram",
      durationMs: 3 * HOUR + 60_000,
    });
    expect(parseAccountPauseReason(heldSendReason(PAGE, START + 30 * 60_000))).toEqual({ platform: "Facebook", durationMs: 30 * 60_000 });
  });
});
