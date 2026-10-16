import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { GET } from "./route";
import { GET as GET_LIVE } from "./live/route";

const healthGlobals = globalThis as unknown as {
  linkarWebHealth?: unknown;
  linkarHealthRedis?: { disconnect(): void };
  linkarHealthRedisUrl?: string;
  linkarHealthRedisPending?: unknown;
};

let silentServer: Server | undefined;
const silentSockets = new Set<Socket>();
let silentConnections = 0;

afterEach(async () => {
  delete healthGlobals.linkarWebHealth;
  healthGlobals.linkarHealthRedis?.disconnect();
  delete healthGlobals.linkarHealthRedis;
  delete healthGlobals.linkarHealthRedisUrl;
  delete healthGlobals.linkarHealthRedisPending;
  for (const socket of silentSockets) socket.destroy();
  silentSockets.clear();
  await new Promise<void>((resolve) => (silentServer ? silentServer.close(() => resolve()) : resolve()));
  silentServer = undefined;
  silentConnections = 0;
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

/** A Valkey that accepts connections and then never replies, like a SIGSTOPped one. */
async function silentRedisUrl(): Promise<string> {
  silentServer = createServer((socket) => {
    silentConnections += 1;
    silentSockets.add(socket);
    socket.on("data", () => undefined);
  });
  await new Promise<void>((resolve) => silentServer!.listen(0, "127.0.0.1", resolve));
  return `redis://127.0.0.1:${(silentServer!.address() as AddressInfo).port}`;
}

describe("GET /api/health", () => {
  it("returns only the status and release commit to anonymous callers", async () => {
    stubDemoProduction();
    const response = await GET(new Request("http://localhost/api/health"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    // The host release script greps the public body for the deployed commit.
    const text = await response.text();
    // Dokploy's service healthcheck requires dependencies.database/redis.
    expect(JSON.parse(text)).toEqual({
      status: "ok",
      release: "0123456789abcdef0123456789abcdef01234567",
      dependencies: { database: "not_configured", redis: "not_configured" },
    });
    expect(text).toContain('"release":"0123456789abcdef0123456789abcdef01234567","dependencies"');
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

  it("answers inside the probe budget, reporting redis as an error, when Valkey stops replying", async () => {
    stubDemoProduction();
    vi.stubEnv("REDIS_URL", await silentRedisUrl());
    const started = Date.now();

    const response = await GET(new Request("http://localhost/api/health"));

    expect(Date.now() - started).toBeLessThan(4_000);
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(JSON.parse(text)).toEqual({
      status: "degraded",
      release: "0123456789abcdef0123456789abcdef01234567",
      dependencies: { database: "not_configured", redis: "error" },
    });
    // Key order is what ops/dokploy/release-linkar.sh matches on.
    expect(text).toContain('"release":"0123456789abcdef0123456789abcdef01234567","dependencies"');
  });
});

describe("GET /api/health/live", () => {
  it("answers 200 with the baked release and no caching", async () => {
    stubDemoProduction();
    const response = GET_LIVE();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ok",
      release: "0123456789abcdef0123456789abcdef01234567",
    });
  });

  it("stays 200 without touching Redis or the database while both are unreachable", async () => {
    stubDemoProduction();
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@127.0.0.1:1/linkar");
    vi.stubEnv("REDIS_URL", await silentRedisUrl());

    const response = GET_LIVE();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(response.status).toBe(200);
    expect(silentConnections).toBe(0);
    expect(await response.text()).not.toContain("secret");
  });

  it("reports no release when the image has no baked commit", async () => {
    stubDemoProduction();
    vi.stubEnv("BUILD_COMMIT", "");
    await expect(GET_LIVE().json()).resolves.toEqual({ status: "ok", release: null });
  });
});
