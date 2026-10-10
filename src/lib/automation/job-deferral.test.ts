import { DelayedError } from "bullmq";
import { describe, expect, it, vi } from "vitest";
import { runWithSendDeferral } from "./job-deferral";
import { RetryableAutomationError } from "./runner";
import { SendDeferredError } from "./send-deferral";

function fakeJob() {
  return { id: "job_1", name: "flow-followup", moveToDelayed: vi.fn().mockResolvedValue(undefined) };
}

describe("runWithSendDeferral", () => {
  it("parks a deferred job until the deferral ends instead of failing it", async () => {
    const job = fakeJob();
    const deferral = new SendDeferredError("Quiet hours are active for this workspace", 8 * 60 * 60_000, () => 0);

    await expect(runWithSendDeferral(job, "token_1", async () => { throw deferral; }, () => 1_000))
      .rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledWith(1_000 + 8 * 60 * 60_000, "token_1");
  });

  it("finds a deferral wrapped by a runner's retryable error", async () => {
    const job = fakeJob();
    const deferral = new SendDeferredError("Send rate limit reached", 30_000, () => 0);
    const wrapped = new RetryableAutomationError("Send rate limit reached", { cause: deferral });

    await expect(runWithSendDeferral(job, "token_1", async () => { throw wrapped; }, () => 0))
      .rejects.toBeInstanceOf(DelayedError);
    expect(job.moveToDelayed).toHaveBeenCalledWith(30_000, "token_1");
  });

  it("rethrows ordinary failures so BullMQ retries them", async () => {
    const job = fakeJob();
    const failure = new Error("provider down");
    await expect(runWithSendDeferral(job, "token_1", async () => { throw failure; })).rejects.toBe(failure);
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it("never schedules a deferral shorter than a second", () => {
    expect(new SendDeferredError("rate", 0, () => 0).delayMs).toBe(1_000);
  });
});
