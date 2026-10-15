import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MetaApiError } from "../meta/client";
import {
  ACCOUNT_RECOVERING_REASON,
  ACCOUNT_THROTTLED_REASON,
  META_ERROR_REASONS,
  parseAccountPauseReason,
} from "../meta/errors";
import { createMemoryRepository } from "../memory-repository";
import { notifyWorkspaceManagers } from "../notifications";
import { getRepository } from "../repository-provider";
import type { AutomationRepository } from "../repository";
import { checkAccountSendGate, resetAccountPauseStateForTests } from "./account-pause";
import {
  classifyProviderFailure,
  deliveryKeys,
  executeOutboundDelivery,
  providerAccountSignal,
} from "./outbound-delivery";
import { SendDeferredError } from "./send-deferral";

vi.mock("../repository-provider", () => ({ getRepository: vi.fn() }));
vi.mock("../notifications", () => ({ notifyWorkspaceManagers: vi.fn(async () => true) }));

const PAUSE_ENV_KEYS = ["REDIS_URL", "DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR", "ACCOUNT_RECOVERY_HOURS"] as const;
const savedPauseEnv = Object.fromEntries(PAUSE_ENV_KEYS.map((key) => [key, process.env[key]]));

const request = {
  deliveryKey: "automation:automation_1:event:event_1:action:0",
  workspaceId: "workspace_a",
  automationId: "automation_1",
  instagramAccountId: "ig_1",
  recipientId: "recipient_1",
  kind: "CLASSIC_ACTION" as const,
  payload: { text: "Original message" },
  claimLeaseMs: 30_000,
  entitlementService: {
    getMonthlyDeliveryLimit: vi.fn(),
  },
};
const { entitlementService: _entitlementService, ...persistedRequest } = request;
void _entitlementService;

describe("outbound delivery coordinator", () => {
  let repository: AutomationRepository;

  beforeEach(() => {
    repository = createMemoryRepository();
    vi.mocked(getRepository).mockReturnValue(repository);
    request.entitlementService.getMonthlyDeliveryLimit.mockReset().mockResolvedValue(100);
    // Account pauses live in this process's memory here (no Redis), and must
    // not carry from one test to the next.
    for (const key of PAUSE_ENV_KEYS) delete process.env[key];
    resetAccountPauseStateForTests();
    vi.mocked(notifyWorkspaceManagers).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    for (const key of PAUSE_ENV_KEYS) {
      if (savedPauseEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedPauseEnv[key];
    }
  });

  it("skips the provider for an existing SENT delivery", async () => {
    await repository.ensureOutboundDelivery(persistedRequest);
    await repository.claimOutboundDelivery(request.deliveryKey, "seed_owner", "2026-08-23T10:05:00.000Z");
    await repository.completeOutboundDelivery(
      request.deliveryKey,
      "seed_owner",
      "provider_existing",
      "2026-08-23T10:01:00.000Z",
    );
    const send = vi.fn();

    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "SENT",
      providerMessageId: "provider_existing",
      reused: true,
      deliveryId: expect.stringMatching(/^delivery_/),
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("makes one provider call under concurrent execution", async () => {
    let resolveSend!: (value: { id: string }) => void;
    const send = vi.fn().mockReturnValue(new Promise<{ id: string }>((resolve) => {
      resolveSend = resolve;
    }));

    const first = executeOutboundDelivery(request, send);
    const second = executeOutboundDelivery(request, send);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    resolveSend({ id: "provider_1" });

    await expect(first).resolves.toMatchObject({ status: "SENT", reused: false, deliveryId: expect.stringMatching(/^delivery_/) });
    await expect(second).resolves.toEqual({ status: "BUSY" });
  });

  it("marks a status-zero failure UNKNOWN and never retries it", async () => {
    const send = vi.fn().mockRejectedValue(new MetaApiError("network", 0, false));
    const releaseReservation = vi.spyOn(repository, "releaseOutboundDeliveryReservation");

    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "UNKNOWN",
      error: "network",
    });
    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "UNKNOWN",
      error: "network",
      reused: true,
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect((await repository.getOutboundDelivery(request.deliveryKey))?.state).toBe("UNKNOWN");
    expect(releaseReservation).toHaveBeenCalledWith(request.deliveryKey);
  });

  it("does not call the provider when the monthly delivery limit is exhausted", async () => {
    request.entitlementService.getMonthlyDeliveryLimit.mockResolvedValue(0);
    const send = vi.fn();

    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "FAILED",
      retryable: false,
      error: "Monthly delivery limit reached",
      reason: "QUOTA_REJECTED",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("leaves a retryable ledger outcome when usage metering is unavailable", async () => {
    request.entitlementService.getMonthlyDeliveryLimit.mockRejectedValue(new Error("usage database unavailable"));
    const send = vi.fn();

    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "FAILED",
      retryable: true,
      error: "Delivery usage could not be reserved",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    [429, "KNOWN_RETRYABLE", true],
    [503, "KNOWN_RETRYABLE", true],
    [400, "KNOWN_PERMANENT", false],
  ] as const)("classifies an explicit %i response as %s", async (status, expected, retryable) => {
    const error = new MetaApiError(`Meta ${status}`, status, true);
    expect(classifyProviderFailure(error)).toBe(expected);
    const releaseReservation = vi.spyOn(repository, "releaseOutboundDeliveryReservation");

    // A campaign action returns its failure; a throttled classic action would
    // park the job instead (covered below).
    await expect(executeOutboundDelivery({ ...request, kind: "CAMPAIGN_ACTION" }, vi.fn().mockRejectedValue(error)))
      .resolves.toEqual({ status: "FAILED", retryable, error: `Meta ${status}` });
    expect(await repository.getOutboundDelivery(request.deliveryKey)).toMatchObject({
      state: "FAILED",
      retryable,
    });
    expect(releaseReservation).toHaveBeenCalledWith(request.deliveryKey);
  });

  it.each([4, 17, 32, 613, 80002, 80006])("waits out Meta throttling (HTTP 400, Graph code %i) instead of retrying in seconds", async (code) => {
    const error = new MetaApiError("Application request limit reached", 400, true, true, code);
    expect(classifyProviderFailure(error)).toBe("KNOWN_RETRYABLE");
    expect(providerAccountSignal(error)).toBe("rate_limited");

    const deferral = await executeOutboundDelivery(request, vi.fn().mockRejectedValue(error)).catch((thrown: unknown) => thrown);
    expect(deferral).toBeInstanceOf(SendDeferredError);
    expect((deferral as SendDeferredError).message).toBe(ACCOUNT_THROTTLED_REASON);
    // The first throttled attempt waits a minute (plus up to a minute of jitter).
    expect((deferral as SendDeferredError).delayMs).toBeGreaterThanOrEqual(60_000);
    expect((deferral as SendDeferredError).delayMs).toBeLessThanOrEqual(120_000);
    expect(await repository.getOutboundDelivery(request.deliveryKey)).toMatchObject({
      state: "FAILED",
      retryable: true,
      resultCode: "RETRYABLE_REJECTION",
    });
  });

  it("backs off 1, 5, then 15 minutes, and then leaves a throttled send to the job's own retries", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.parse("2026-10-16T10:00:00.000Z");
    vi.setSystemTime(start);
    const error = new MetaApiError("Application request limit reached", 400, true, true, 4);
    const send = vi.fn().mockRejectedValue(error);
    const waits: number[] = [];
    for (let attempt = 0; attempt < 3; attempt += 1) {
      // Far enough apart that the throttles never pause the whole account.
      vi.setSystemTime(start + attempt * 20 * 60_000);
      const thrown = await executeOutboundDelivery(request, send).catch((caught: unknown) => caught);
      expect(thrown).toBeInstanceOf(SendDeferredError);
      waits.push((thrown as SendDeferredError).delayMs);
    }
    expect(waits[0]).toBeGreaterThanOrEqual(60_000);
    expect(waits[1]).toBeGreaterThanOrEqual(5 * 60_000);
    expect(waits[2]).toBeGreaterThanOrEqual(15 * 60_000);
    expect(waits.every((wait, index) => wait <= [60_000, 5 * 60_000, 15 * 60_000][index] + 60_000)).toBe(true);

    vi.setSystemTime(start + 60 * 60_000);
    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "FAILED",
      retryable: true,
      error: "Application request limit reached",
    });
    expect(send).toHaveBeenCalledTimes(4);
  });

  it("returns a retryable failure for throttled kinds that cannot park a job", async () => {
    const campaign = { ...request, kind: "CAMPAIGN_ACTION" as const };
    const error = new MetaApiError("Application request limit reached", 400, true, true, 613);
    await expect(executeOutboundDelivery(campaign, vi.fn().mockRejectedValue(error)))
      .resolves.toEqual({ status: "FAILED", retryable: true, error: "Application request limit reached" });
  });

  it("pauses the whole account briefly after repeated throttles, so its other sends wait too", async () => {
    const error = new MetaApiError("Application request limit reached", 400, true, true, 4);
    for (let index = 0; index < 3; index += 1) {
      await executeOutboundDelivery(
        { ...request, deliveryKey: `throttled:${index}` },
        vi.fn().mockRejectedValue(error),
      ).catch(() => undefined);
    }
    await expect(checkAccountSendGate({ channel: "instagram", accountId: "ig_1" })).resolves.toMatchObject({ status: "throttled" });

    const prepare = vi.spyOn(repository, "prepareOutboundDelivery");
    const send = vi.fn().mockResolvedValue({ id: "provider_1" });
    const held = await executeOutboundDelivery({ ...request, deliveryKey: "another:send" }, send).catch((thrown: unknown) => thrown);
    expect(held).toBeInstanceOf(SendDeferredError);
    expect((held as SendDeferredError).message).toBe(ACCOUNT_THROTTLED_REASON);
    expect((held as SendDeferredError).delayMs).toBeGreaterThan(14 * 60_000);
    await expect(executeOutboundDelivery({ ...request, kind: "CAMPAIGN_ACTION", deliveryKey: "campaign:send" }, send))
      .resolves.toEqual({ status: "FAILED", retryable: true, error: ACCOUNT_THROTTLED_REASON });
    expect(send).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();

    // A different account keeps sending.
    await expect(executeOutboundDelivery({ ...request, instagramAccountId: "ig_2", deliveryKey: "other:account" }, send))
      .resolves.toMatchObject({ status: "SENT" });
  });

  it.each([
    ["error 368", new MetaApiError(META_ERROR_REASONS.accountBlocked, 400, true, false, 368)],
    ["#2022 under a permission code", new MetaApiError(META_ERROR_REASONS.accountBlocked, 400, true, false, 10)],
    ["#2022 as the subcode of a retryable error", new MetaApiError("Temporary", 400, true, true, 2, 2022)],
  ])("pauses every send for the account after %s, and tells the owners once", async (_label, error) => {
    expect(classifyProviderFailure(error)).toBe("KNOWN_PERMANENT");
    expect(providerAccountSignal(error)).toBe("account_blocked");
    await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: "sealed",
      status: "CONNECTED",
    });

    const refused = await executeOutboundDelivery(request, vi.fn().mockRejectedValue(error));
    expect(refused).toMatchObject({ status: "FAILED", retryable: false });
    expect(refused.status === "FAILED" && parseAccountPauseReason(refused.error)).toEqual({ platform: "Instagram", durationMs: 24 * 60 * 60_000 });
    expect(await repository.getOutboundDelivery(request.deliveryKey)).toMatchObject({
      state: "FAILED",
      retryable: false,
      resultCode: "PROVIDER_REJECTED",
    });
    await vi.waitFor(() => expect(notifyWorkspaceManagers).toHaveBeenCalledOnce());
    expect(vi.mocked(notifyWorkspaceManagers).mock.calls[0]?.[2]).toBe("Instagram has limited @creator");

    // New triggers stop at the gate: no Meta call, no usage kept, a plain reason.
    const release = vi.spyOn(repository, "releaseOutboundDeliveryReservation");
    const send = vi.fn().mockResolvedValue({ id: "provider_1" });
    for (const kind of ["CLASSIC_ACTION", "CAMPAIGN_ACTION", "BROADCAST_RECIPIENT", "FLOW_FOLLOWUP", "MANUAL_INBOX"] as const) {
      const deliveryKey = `held:${kind}`;
      const held = await executeOutboundDelivery({ ...request, kind, deliveryKey }, send);
      expect(held).toMatchObject({ status: "FAILED", retryable: false, reason: "ACCOUNT_PAUSED" });
      expect(held.status === "FAILED" && held.error).toMatch(
        /^Not sent\. Instagram has limited this account, so Linkar paused sending from it for another (24 hours|23 hours and 59 minutes)\.$/,
      );
      expect(await repository.getOutboundDelivery(deliveryKey)).toMatchObject({
        state: "FAILED",
        retryable: false,
        resultCode: "SUPPRESSED",
      });
      expect(release).toHaveBeenCalledWith(deliveryKey);
    }
    expect(send).not.toHaveBeenCalled();

    // A sequence step waits the pause out instead: retryable, and nothing is
    // recorded, so sequence-runner backs it off rather than ending the sequence.
    const step = await executeOutboundDelivery({ ...request, kind: "SEQUENCE_STEP", deliveryKey: "held:SEQUENCE_STEP" }, send);
    expect(step).toMatchObject({ status: "FAILED", retryable: true, reason: "ACCOUNT_PAUSED" });
    expect(step.status === "FAILED" && parseAccountPauseReason(step.error)?.platform).toBe("Instagram");
    expect(await repository.getOutboundDelivery("held:SEQUENCE_STEP")).toBeNull();
    expect(send).not.toHaveBeenCalled();

    // Another block during the same pause does not email again.
    await executeOutboundDelivery({ ...request, deliveryKey: "in-flight" }, vi.fn().mockRejectedValue(error));
    expect(notifyWorkspaceManagers).toHaveBeenCalledOnce();
  });

  it("keeps an outcome already recorded, and still sends lead emails, during a pause", async () => {
    await repository.ensureOutboundDelivery(persistedRequest);
    await repository.claimOutboundDelivery(request.deliveryKey, "seed_owner", "2026-08-23T10:05:00.000Z");
    await repository.completeOutboundDelivery(request.deliveryKey, "seed_owner", "provider_existing", "2026-08-23T10:01:00.000Z");
    const block = new MetaApiError(META_ERROR_REASONS.accountBlocked, 400, true, false, 368);
    await executeOutboundDelivery({ ...request, deliveryKey: "blocked" }, vi.fn().mockRejectedValue(block));

    const send = vi.fn().mockResolvedValue({ id: "lead_1" });
    await expect(executeOutboundDelivery(request, send)).resolves.toMatchObject({
      status: "SENT",
      providerMessageId: "provider_existing",
      reused: true,
    });
    await expect(executeOutboundDelivery({ ...request, kind: "LEAD_EMAIL", deliveryKey: "lead:1" }, send))
      .resolves.toMatchObject({ status: "SENT", providerMessageId: "lead_1" });
    expect(send).toHaveBeenCalledOnce();
  });

  it("restarts slowly after the pause: a reduced hourly share, not counting typed replies", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.parse("2026-10-16T10:15:00.000Z");
    vi.setSystemTime(start);
    // 25% of a 4-an-hour DM ceiling: one automatic send an hour while recovering.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    const block = new MetaApiError(META_ERROR_REASONS.accountBlocked, 400, true, false, 368);
    await executeOutboundDelivery({ ...request, deliveryKey: "blocked" }, vi.fn().mockRejectedValue(block));

    vi.setSystemTime(start + 24 * 60 * 60_000 + 60_000);
    const send = vi.fn().mockResolvedValue({ id: "provider_1" });
    await expect(executeOutboundDelivery({ ...request, deliveryKey: "first" }, send)).resolves.toMatchObject({ status: "SENT" });
    const held = await executeOutboundDelivery({ ...request, deliveryKey: "second" }, send).catch((thrown: unknown) => thrown);
    expect(held).toBeInstanceOf(SendDeferredError);
    expect((held as SendDeferredError).message).toBe(ACCOUNT_RECOVERING_REASON);
    await expect(executeOutboundDelivery({ ...request, kind: "SEQUENCE_STEP", deliveryKey: "sequence" }, send))
      .resolves.toEqual({ status: "FAILED", retryable: true, error: ACCOUNT_RECOVERING_REASON });
    await expect(executeOutboundDelivery({ ...request, kind: "MANUAL_INBOX", deliveryKey: "typed" }, send))
      .resolves.toMatchObject({ status: "SENT" });
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("never holds a campaign action for the recovery budget, but counts it against the other sends", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const start = Date.parse("2026-10-16T10:15:00.000Z");
    vi.setSystemTime(start);
    // 25% of a 4-an-hour DM ceiling: one automatic send an hour while recovering.
    process.env.DIRECT_MESSAGE_RATE_LIMIT_PER_HOUR = "4";
    const block = new MetaApiError(META_ERROR_REASONS.accountBlocked, 400, true, false, 368);
    await executeOutboundDelivery({ ...request, deliveryKey: "blocked" }, vi.fn().mockRejectedValue(block));

    // Comment-to-DM replies keep going out all through recovery, hour after
    // hour, instead of failing once campaign-runner's job retries run out.
    const send = vi.fn().mockResolvedValue({ id: "provider_1" });
    const recoveryStart = start + 24 * 60 * 60_000 + 60_000;
    for (const hour of [0, 1, 12, 23]) {
      vi.setSystemTime(recoveryStart + hour * 60 * 60_000);
      for (let index = 0; index < 3; index += 1) {
        await expect(executeOutboundDelivery(
          { ...request, kind: "CAMPAIGN_ACTION", deliveryKey: `campaign:${hour}:${index}` },
          send,
        )).resolves.toMatchObject({ status: "SENT" });
      }
      // They used this hour's share, so a broadcast waits for the next hour.
      const broadcast = await executeOutboundDelivery(
        { ...request, kind: "BROADCAST_RECIPIENT", deliveryKey: `broadcast:${hour}` },
        send,
      ).catch((thrown: unknown) => thrown);
      expect(broadcast).toBeInstanceOf(SendDeferredError);
      expect((broadcast as SendDeferredError).message).toBe(ACCOUNT_RECOVERING_REASON);
    }
    expect(send).toHaveBeenCalledTimes(12);
  });

  it("stretches a throttle pause to Meta's own estimate from its usage headers", async () => {
    const usage = { highestPercent: 100, regainAccessMs: 40 * 60_000 };
    const error = new MetaApiError("Application request limit reached", 400, true, true, 4, undefined, usage);
    const deferral = await executeOutboundDelivery(request, vi.fn().mockRejectedValue(error)).catch((thrown: unknown) => thrown);
    expect(deferral).toBeInstanceOf(SendDeferredError);
    // One throttle alone would wait a minute; Meta said 40.
    expect((deferral as SendDeferredError).delayMs).toBeGreaterThanOrEqual(39 * 60_000);
    const gate = await checkAccountSendGate({ channel: "instagram", accountId: "ig_1" });
    expect(gate.status).toBe("throttled");
    expect(gate.status === "throttled" && gate.until - Date.now()).toBeGreaterThan(39 * 60_000);
  });

  it("reads only Meta's own answers as account signals", () => {
    expect(providerAccountSignal(new SendDeferredError("Send rate limit reached", 1_000))).toBeNull();
    expect(providerAccountSignal(new MetaApiError("network", 0, false))).toBeNull();
    expect(providerAccountSignal(new MetaApiError("Bad request", 400, true, false, 100))).toBeNull();
    expect(providerAccountSignal(new Error("boom"))).toBeNull();
    expect(providerAccountSignal(new MetaApiError("Too many", 429, true))).toBe("rate_limited");
  });

  it("marks the connection EXPIRED when a send is rejected with code 190", async () => {
    const connection = await repository.upsertConnection({
      workspaceId: "workspace_a",
      igUserId: "ig_1",
      username: "creator",
      accessTokenEncrypted: "sealed",
      status: "CONNECTED",
    });
    const error = new MetaApiError("Error validating access token", 400, true, false, 190);

    await expect(executeOutboundDelivery(request, vi.fn().mockRejectedValue(error)))
      .resolves.toMatchObject({ status: "FAILED", retryable: false });
    const [stored] = await repository.listConnections("workspace_a");
    expect(stored).toMatchObject({ id: connection.id, status: "EXPIRED" });
    expect(await repository.getOutboundDelivery(request.deliveryKey)).toMatchObject({
      state: "FAILED",
      resultCode: "PROVIDER_REJECTED",
    });
  });

  it("treats a network failure as retryable when the caller opts in", async () => {
    const error = new MetaApiError("network", 0, false);
    expect(classifyProviderFailure(error, true)).toBe("KNOWN_RETRYABLE");

    await expect(executeOutboundDelivery(
      { ...request, networkFailuresAreRetryable: true },
      vi.fn().mockRejectedValue(error),
    )).resolves.toEqual({ status: "FAILED", retryable: true, error: "network" });
    expect(await repository.getOutboundDelivery(request.deliveryKey)).toMatchObject({
      state: "FAILED",
      retryable: true,
    });
  });

  it("prepares claim and quota in one repository operation", async () => {
    const prepare = vi.spyOn(repository, "prepareOutboundDelivery");
    const ensure = vi.spyOn(repository, "ensureOutboundDelivery");
    const claim = vi.spyOn(repository, "claimOutboundDelivery");

    await expect(executeOutboundDelivery(
      request,
      vi.fn().mockResolvedValue({ id: "provider_atomic" }),
    )).resolves.toMatchObject({ status: "SENT", reused: false });

    expect(prepare).toHaveBeenCalledOnce();
    expect(prepare).toHaveBeenCalledWith(expect.objectContaining({
      deliveryKey: request.deliveryKey,
      monthlyLimit: 100,
      owner: expect.any(String),
      periodStart: expect.stringMatching(/^\d{4}-\d{2}-01$/),
    }));
    expect(ensure).not.toHaveBeenCalled();
    expect(claim).not.toHaveBeenCalled();
  });

  it("reports provider timing without exposing the payload", async () => {
    const timingObserver = {
      providerStarted: vi.fn(),
      providerFinished: vi.fn(),
    };

    await executeOutboundDelivery(
      { ...request, timingObserver },
      vi.fn().mockResolvedValue({ id: "provider_timed" }),
    );

    expect(timingObserver.providerStarted).toHaveBeenCalledOnce();
    expect(timingObserver.providerFinished).toHaveBeenCalledWith(expect.any(Number), true);
    expect(timingObserver.providerFinished.mock.calls[0]?.[0]).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(timingObserver.providerFinished.mock.calls)).not.toContain("Original message");
  });

  it("sends the first persisted payload after an automation edit", async () => {
    await repository.ensureOutboundDelivery(persistedRequest);
    const send = vi.fn().mockResolvedValue({ id: "provider_1" });

    await executeOutboundDelivery({
      ...request,
      payload: { text: "Edited message" },
    }, send);

    expect(send).toHaveBeenCalledWith({ text: "Original message" });
  });

  it("marks provider success UNKNOWN when SENT persistence fails", async () => {
    const realRepository = repository;
    repository = {
      ...realRepository,
      completeOutboundDelivery: vi.fn().mockRejectedValue(new Error("database unavailable")),
    };
    vi.mocked(getRepository).mockReturnValue(repository);
    const send = vi.fn().mockResolvedValue({ id: "provider_1" });

    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "UNKNOWN",
      error: "database unavailable",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect((await realRepository.getOutboundDelivery(request.deliveryKey))?.state).toBe("UNKNOWN");
  });

  it("builds stable delivery keys for every outbound surface", () => {
    expect(deliveryKeys.classicAction("a", "e", 2)).toBe("automation:a:event:e:action:2");
    expect(deliveryKeys.emailCapture("a", "e", "confirmation")).toBe("automation:a:event:e:capture:confirmation");
    expect(deliveryKeys.campaignAction("p", "opening")).toBe("campaign:p:action:opening");
    expect(deliveryKeys.sequenceStep("en", "step")).toBe("sequence:en:step:step");
    expect(deliveryKeys.broadcastRecipient("b", "ig", "r")).toBe("broadcast:b:ig:r");
    expect(deliveryKeys.lead("c", "a", "webhook", "captured")).toBe("lead:c:automation:a:webhook:captured");
  });
});
