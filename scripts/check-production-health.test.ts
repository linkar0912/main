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

describe("production release and worker verification", () => {
  const sha = "0123456789abcdef0123456789abcdef01234567";
  const live = { ...healthy, release: sha, worker: { heartbeat: "ok", release: sha } };
  const respond = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

  it("sends the detail token and accepts matching web and worker releases", async () => {
    const fetch = respond(live);
    await expect(checkProductionHealth({
      url: "https://app.linkar.in/api/health",
      fetch,
      attempts: 1,
      detailToken: "operator-token",
      expectedRelease: sha,
    })).resolves.toEqual({ ok: true, release: sha });
    expect(fetch.mock.calls[0]![1].headers["x-health-token"]).toBe("operator-token");
  });

  it.each([
    ["an older web release", { ...live, release: "f".repeat(40) }, "expected web release"],
    ["an older worker release", { ...live, worker: { heartbeat: "ok", release: "f".repeat(40) } }, "expected worker release"],
    ["a stale worker", { ...live, status: "degraded", worker: { heartbeat: "stale", release: sha } }, "status ok"],
  ])("rejects %s", async (_name, body, message) => {
    await expect(checkProductionHealth({
      url: "https://app.linkar.in/api/health",
      fetch: respond(body),
      attempts: 1,
      detailToken: "operator-token",
      expectedRelease: sha,
    })).rejects.toThrow(message);
  });

  it("rejects a stale worker heartbeat even when the overall status was not downgraded", async () => {
    await expect(checkProductionHealth({
      url: "https://app.linkar.in/api/health",
      fetch: respond({ ...live, worker: { heartbeat: "stale", release: null } }),
      attempts: 1,
      detailToken: "operator-token",
    })).rejects.toThrow("live worker heartbeat");
  });

  it("flags web and worker drift without an expected release", async () => {
    await expect(checkProductionHealth({
      url: "https://app.linkar.in/api/health",
      fetch: respond({ ...live, worker: { heartbeat: "ok", release: "f".repeat(40) } }),
      attempts: 1,
      detailToken: "operator-token",
    })).rejects.toThrow("different releases");
  });

  it("accepts the public status-only response without a token", async () => {
    await expect(checkProductionHealth({ url: "https://app.linkar.in/api/health", fetch: respond({ status: "ok" }), attempts: 1 }))
      .resolves.toEqual({ ok: true, release: null });
    await expect(checkProductionHealth({ url: "https://app.linkar.in/api/health", fetch: respond({ status: "degraded" }), attempts: 1 }))
      .rejects.toThrow("status ok");
  });

  it("refuses to claim a release check without the detail token", async () => {
    await expect(checkProductionHealth({ url: "https://app.linkar.in/api/health", fetch: respond(live), expectedRelease: sha }))
      .rejects.toThrow("EXPECTED_RELEASE needs HEALTH_DETAIL_TOKEN");
  });

  it("reports a rejected detail token instead of passing on the public view", async () => {
    await expect(checkProductionHealth({
      url: "https://app.linkar.in/api/health",
      fetch: respond({ status: "ok" }),
      attempts: 1,
      detailToken: "wrong",
    })).rejects.toThrow("did not accept HEALTH_DETAIL_TOKEN");
  });
});
