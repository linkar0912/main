import { describe, expect, it, vi } from "vitest";
import { checkProductionHealth } from "./check-production-health.mjs";

const healthy = {
  status: "ok",
  mode: "configured",
  release: "abc123",
  dependencies: { database: "ok", redis: "ok" },
  integrations: { instagram: "configured", facebook: "configured" },
  capabilities: { followGatedCampaigns: "enabled" },
};

describe("external production health check", () => {
  it("accepts a fully configured production response", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(healthy), { status: 200 }));
    await expect(checkProductionHealth({ url: "https://app.linkar.in/api/health", fetch, attempts: 1 }))
      .resolves.toEqual({ ok: true, release: "abc123" });
  });

  it.each([
    ["HTTP failure", new Response("unavailable", { status: 503 }), "HTTP 503"],
    ["invalid JSON", new Response("not-json", { status: 200 }), "valid JSON"],
    ["demo mode", new Response(JSON.stringify({ ...healthy, mode: "demo" }), { status: 200 }), "mode configured"],
    ["database failure", new Response(JSON.stringify({ ...healthy, dependencies: { database: "error", redis: "ok" } }), { status: 200 }), "database ok"],
    ["disabled rollout", new Response(JSON.stringify({ ...healthy, capabilities: { followGatedCampaigns: "disabled" } }), { status: 200 }), "follow-gated enabled"],
  ])("rejects %s", async (_name, response, message) => {
    await expect(checkProductionHealth({
      url: "https://app.linkar.in/api/health",
      fetch: vi.fn().mockResolvedValue(response),
      attempts: 1,
    })).rejects.toThrow(message as string);
  });

  it("retries a transient network failure", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(new Response(JSON.stringify(healthy), { status: 200 }));
    const wait = vi.fn().mockResolvedValue(undefined);
    await expect(checkProductionHealth({ url: "https://app.linkar.in/api/health", fetch, attempts: 2, wait }))
      .resolves.toEqual({ ok: true, release: "abc123" });
    expect(wait).toHaveBeenCalledTimes(1);
  });
});
