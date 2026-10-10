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

async function seedEmail() {
  const repository = createMemoryRepository();
  await repository.ensureOutboundDelivery({
    deliveryKey: "lead:email:1",
    workspaceId: "workspace_a",
    automationId: "automation_1",
    kind: "LEAD_EMAIL",
    payload: { to: "lead@example.com", subject: "Your guide", body: "Here it is" },
  });
  return repository;
}

const emailJob = { deliveryKey: "lead:email:1", workspaceId: "workspace_a", kind: "LEAD_EMAIL" as const };

describe("lead email delivery", () => {
  it("records SENT with the provider id and an idempotency key", async () => {
    const repository = await seedEmail();
    const mailer = vi.fn().mockResolvedValue({ delivered: true, id: "email_1" });
    const result = await processLeadDelivery(emailJob, repository, { mailer });
    expect(result).toMatchObject({ status: "SENT", providerMessageId: "email_1" });
    expect(mailer).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: "lead:email:1" }));
  });

  it("does not mark SENT when the mailer is not configured", async () => {
    const repository = await seedEmail();
    const result = await processLeadDelivery(emailJob, repository, {
      mailer: vi.fn().mockResolvedValue({ delivered: false, reason: "not_configured" }),
    });
    expect(result).toMatchObject({ status: "FAILED", retryable: false });
    expect(await repository.getOutboundDelivery("lead:email:1")).toMatchObject({ state: "FAILED", retryable: false });
  });

  it("retries provider 5xx and network failures", async () => {
    for (const failure of [
      { delivered: false, reason: "provider_error", status: 503 },
      { delivered: false, reason: "network_error" },
    ]) {
      const repository = await seedEmail();
      const result = await processLeadDelivery(emailJob, repository, {
        mailer: vi.fn().mockResolvedValue(failure),
      });
      expect(result).toMatchObject({ status: "FAILED", retryable: true });
      expect(await repository.getOutboundDelivery("lead:email:1")).toMatchObject({ state: "FAILED", retryable: true });
    }
  });

  it("treats a provider 4xx as permanent", async () => {
    const repository = await seedEmail();
    const result = await processLeadDelivery(emailJob, repository, {
      mailer: vi.fn().mockResolvedValue({ delivered: false, reason: "provider_error", status: 422 }),
    });
    expect(result).toMatchObject({ status: "FAILED", retryable: false });
  });
});

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

  it("retries a timeout because the webhook may not have been received", async () => {
    const repository = await seedWebhook();
    const result = await processLeadDelivery({
      deliveryKey: "lead:webhook:1",
      workspaceId: "workspace_a",
      kind: "LEAD_WEBHOOK",
    }, repository, {
      lookup: publicLookup,
      fetcher: vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError")),
    });
    expect(result).toEqual({ status: "FAILED", retryable: true, error: "timed out" });
    expect(await repository.getOutboundDelivery("lead:webhook:1")).toMatchObject({
      state: "FAILED",
      retryable: true,
    });
  });
});
