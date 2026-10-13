import { describe, expect, it } from "vitest";
import { createDeliveryTiming, instrumentRepository, underlyingRepository } from "./delivery-timing";
import type { AutomationRepository } from "../repository";

describe("delivery timing", () => {
  it("measures queue wait, pre-provider work, provider time, and total time", () => {
    const readings = [1_050, 1_080, 1_200];
    const timing = createDeliveryTiming(1_000, () => readings.shift() ?? 1_200);

    timing.workerStarted();
    timing.providerStarted();
    timing.providerFinished(120);

    expect(timing.snapshot()).toEqual({
      queueWaitMs: 50,
      preProviderMs: 30,
      providerMs: 120,
      totalMs: 200,
      providerCalls: 1,
    });
  });

  it("keeps the first provider start and sums multiple provider calls", () => {
    const readings = [100, 130, 200];
    const timing = createDeliveryTiming(90, () => readings.shift() ?? 240);

    timing.workerStarted();
    timing.providerStarted();
    timing.providerFinished(20.8);
    timing.providerStarted();
    timing.providerFinished(30.4);

    expect(timing.snapshot()).toEqual({
      queueWaitMs: 10,
      preProviderMs: 30,
      providerMs: 51,
      totalMs: 110,
      providerCalls: 2,
    });
  });

  it("clamps invalid clock movement to safe non-negative integers", () => {
    const readings = [900, 800, 700];
    const timing = createDeliveryTiming(1_000, () => readings.shift() ?? 700);

    timing.workerStarted();
    timing.providerStarted();
    timing.providerFinished(-5);

    expect(timing.snapshot()).toEqual({
      queueWaitMs: 0,
      preProviderMs: 0,
      providerMs: 0,
      totalMs: 0,
      providerCalls: 1,
    });
  });

  it("times the whole reply from webhook arrival and counts serial database rounds", () => {
    // received 1_000, enqueued 1_010, worker 1_020; two parallel reads, one
    // write, then Meta accepts the send.
    const readings = [1_020, 1_030, 1_060, 1_060, 1_090, 1_100, 1_400, 1_450];
    const timing = createDeliveryTiming(1_010, () => readings.shift() ?? 1_450, 1_000);

    timing.workerStarted(); // 1_020
    timing.databaseStarted(); // round 1 starts 1_030
    timing.databaseStarted(); // overlaps round 1
    timing.databaseFinished();
    timing.databaseFinished(); // round 1 ends 1_060
    timing.databaseStarted(); // round 2 starts 1_060
    timing.databaseFinished(); // round 2 ends 1_090
    timing.providerStarted(); // 1_100
    timing.providerFinished(300, true); // accepted at 1_400

    expect(timing.realtimeSnapshot()).toEqual({
      queueWaitMs: 10,
      preProviderMs: 80,
      providerMs: 300,
      totalMs: 440,
      providerCalls: 1,
      receivedToEnqueuedMs: 10,
      firstReplyMs: 400,
      databaseMs: 60,
      databaseCalls: 3,
      databaseRounds: 2,
    });
  });

  it("does not report a reply when the provider call failed", () => {
    const timing = createDeliveryTiming(0, () => 10);
    timing.providerStarted();
    timing.providerFinished(5, false);
    expect(timing.realtimeSnapshot()).not.toHaveProperty("firstReplyMs");
  });

  it("instruments repository calls per job without changing them", async () => {
    const events: string[] = [];
    const repository = {
      async getContact() { return { id: "contact_1" }; },
      async getOutboundDelivery() { throw new Error("database unavailable"); },
    } as unknown as AutomationRepository;
    const instrumented = instrumentRepository(repository, {
      databaseStarted: () => events.push("start"),
      databaseFinished: () => events.push("finish"),
    });

    await expect(instrumented.getContact("workspace_1", "ig_1", "person_1")).resolves.toEqual({ id: "contact_1" });
    await expect(instrumented.getOutboundDelivery("key_1")).rejects.toThrow("database unavailable");
    expect(events).toEqual(["start", "finish", "start", "finish"]);
    expect(underlyingRepository(instrumented)).toBe(repository);
    expect(underlyingRepository(repository)).toBe(repository);
  });
});
