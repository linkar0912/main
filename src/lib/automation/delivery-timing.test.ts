import { describe, expect, it } from "vitest";
import { createDeliveryTiming } from "./delivery-timing";

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
});
