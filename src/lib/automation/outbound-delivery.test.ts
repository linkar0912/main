import { beforeEach, describe, expect, it, vi } from "vitest";
import { MetaApiError } from "../meta/client";
import { createMemoryRepository } from "../memory-repository";
import { getRepository } from "../repository-provider";
import type { AutomationRepository } from "../repository";
import {
  classifyProviderFailure,
  deliveryKeys,
  executeOutboundDelivery,
} from "./outbound-delivery";

vi.mock("../repository-provider", () => ({ getRepository: vi.fn() }));

const request = {
  deliveryKey: "automation:automation_1:event:event_1:action:0",
  workspaceId: "workspace_a",
  automationId: "automation_1",
  instagramAccountId: "ig_1",
  recipientId: "recipient_1",
  kind: "CLASSIC_ACTION" as const,
  payload: { text: "Original message" },
  claimLeaseMs: 30_000,
};

describe("outbound delivery coordinator", () => {
  let repository: AutomationRepository;

  beforeEach(() => {
    repository = createMemoryRepository();
    vi.mocked(getRepository).mockReturnValue(repository);
  });

  it("skips the provider for an existing SENT delivery", async () => {
    await repository.ensureOutboundDelivery(request);
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

    await expect(first).resolves.toMatchObject({ status: "SENT", reused: false });
    await expect(second).resolves.toEqual({ status: "BUSY" });
  });

  it("marks a status-zero failure UNKNOWN and never retries it", async () => {
    const send = vi.fn().mockRejectedValue(new MetaApiError("network", 0, false));

    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "UNKNOWN",
      error: "network",
    });
    await expect(executeOutboundDelivery(request, send)).resolves.toEqual({
      status: "UNKNOWN",
      error: "network",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect((await repository.getOutboundDelivery(request.deliveryKey))?.state).toBe("UNKNOWN");
  });

  it.each([
    [429, "KNOWN_RETRYABLE", true],
    [503, "KNOWN_RETRYABLE", true],
    [400, "KNOWN_PERMANENT", false],
  ] as const)("classifies an explicit %i response as %s", async (status, expected, retryable) => {
    const error = new MetaApiError(`Meta ${status}`, status, true);
    expect(classifyProviderFailure(error)).toBe(expected);

    await expect(executeOutboundDelivery(request, vi.fn().mockRejectedValue(error)))
      .resolves.toEqual({ status: "FAILED", retryable, error: `Meta ${status}` });
    expect(await repository.getOutboundDelivery(request.deliveryKey)).toMatchObject({
      state: "FAILED",
      retryable,
    });
  });

  it("sends the first persisted payload after an automation edit", async () => {
    await repository.ensureOutboundDelivery(request);
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
