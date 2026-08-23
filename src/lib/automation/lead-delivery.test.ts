import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "../memory-repository";
import { processLeadDelivery } from "./lead-delivery";

const publicLookup = async () => [{ address: "93.184.216.34", family: 4 as const }];

async function seedWebhook(url = "https://hooks.example.com/lead") {
  const repository = createMemoryRepository();
  await repository.ensureOutboundDelivery({
    deliveryKey: "lead:webhook:1",
    workspaceId: "workspace_a",
    automationId: "automation_1",
    kind: "LEAD_WEBHOOK",
    payload: { url, body: { email: "lead@example.com" } },
  });
  return repository;
}

describe("lead delivery", () => {
  it("records an explicit HTTP 500 as retryable FAILED", async () => {
    const repository = await seedWebhook();
    const result = await processLeadDelivery({
      deliveryKey: "lead:webhook:1",
      workspaceId: "workspace_a",
      kind: "LEAD_WEBHOOK",
    }, repository, {
      lookup: publicLookup,
      fetcher: vi.fn().mockResolvedValue(new Response("nope", { status: 500 })),
    });

    expect(result).toEqual({ status: "FAILED", retryable: true, error: "Lead webhook returned HTTP 500" });
    expect(await repository.getOutboundDelivery("lead:webhook:1")).toMatchObject({
      state: "FAILED",
      retryable: true,
    });
  });

  it("blocks a redirect from a public host to a private target", async () => {
    const repository = await seedWebhook();
    const fetcher = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { location: "http://10.0.0.8/internal" },
    }));

    const result = await processLeadDelivery({
      deliveryKey: "lead:webhook:1",
      workspaceId: "workspace_a",
      kind: "LEAD_WEBHOOK",
    }, repository, { lookup: publicLookup, fetcher });

    expect(result).toMatchObject({ status: "FAILED", retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("rejects a fourth redirect", async () => {
    const repository = await seedWebhook();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://one.example.com" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://two.example.com" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://three.example.com" } }))
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://four.example.com" } }));

    const result = await processLeadDelivery({
      deliveryKey: "lead:webhook:1",
      workspaceId: "workspace_a",
      kind: "LEAD_WEBHOOK",
    }, repository, { lookup: publicLookup, fetcher });

    expect(result).toMatchObject({ status: "FAILED", retryable: false });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("marks a timeout UNKNOWN because provider receipt is ambiguous", async () => {
    const repository = await seedWebhook();
    const result = await processLeadDelivery({
      deliveryKey: "lead:webhook:1",
      workspaceId: "workspace_a",
      kind: "LEAD_WEBHOOK",
    }, repository, {
      lookup: publicLookup,
      fetcher: vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    });
    expect(result).toEqual({ status: "UNKNOWN", error: "timed out" });
  });
});
