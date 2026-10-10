import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

afterEach(() => {
  delete (globalThis as { linkarWebHealth?: unknown }).linkarWebHealth;
  vi.unstubAllEnvs();
});

function stubDemoProduction() {
  // DEMO_MODE keeps the production boot checks out of this route-level test.
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("DEMO_MODE", "1");
  vi.stubEnv("DATABASE_URL", "");
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("PLATFORM_OWNER_USER_IDS", "11111111-1111-4111-8111-111111111111");
  vi.stubEnv("AUTH_SESSION_SECRET", "route-test-session-secret-at-least-32");
  vi.stubEnv("BUILD_COMMIT", "0123456789abcdef0123456789abcdef01234567");
  vi.stubEnv("HEALTH_DETAIL_TOKEN", "operator-health-token");
}

describe("GET /api/health", () => {
  it("returns only the status and release commit to anonymous callers", async () => {
    stubDemoProduction();
    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The host release script greps the public body for the deployed commit.
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({ status: "ok", release: "0123456789abcdef0123456789abcdef01234567" });
    expect(text).toContain('"release":"0123456789abcdef0123456789abcdef01234567"');
  });

  it("returns the release and dependency detail to the release tooling", async () => {
    stubDemoProduction();
    const response = await GET(new Request("http://localhost/api/health", {
      headers: { "x-health-token": "operator-health-token" },
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "ok",
      release: "0123456789abcdef0123456789abcdef01234567",
      dependencies: { database: "not_configured", redis: "not_configured" },
      worker: { heartbeat: "not_configured" },
    });
  });
});
