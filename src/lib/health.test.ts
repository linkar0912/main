import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type AddressInfo, type Server, type Socket } from "node:net";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canViewHealthDetail,
  getCachedWebHealth,
  getHealth,
  getHealthRedis,
  HEALTH_DATABASE_PROBE_TIMEOUT_MS,
  HEALTH_REDIS_PROBE_TIMEOUT_MS,
  isWebServing,
  parseWorkerHeartbeat,
  WORKER_HEARTBEAT_STALE_MS,
} from "./health";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Keeps the integration verdict deterministic regardless of the ambient env. */
function stubNoIntegrationCredentials() {
  vi.stubEnv("META_APP_ID", "");
  vi.stubEnv("META_APP_SECRET", "");
  vi.stubEnv("FACEBOOK_APP_ID", "");
  vi.stubEnv("FACEBOOK_APP_SECRET", "");
}

const NO_INTEGRATIONS = { instagram: "not_configured", facebook: "not_configured" } as const;
const DISABLED_CAPABILITIES = { followGatedCampaigns: "disabled" } as const;

describe("getHealth", () => {
  it("reports demo mode with unconfigured dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("BUILD_COMMIT", "");
    stubNoIntegrationCredentials();

    await expect(getHealth()).resolves.toEqual({
      status: "ok",
      mode: "demo",
      release: null,
      dependencies: {
        database: "not_configured",
        redis: "not_configured",
      },
      integrations: NO_INTEGRATIONS,
      capabilities: DISABLED_CAPABILITIES,
    });
  });

  it("reports configured healthy dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@redis:6379");
    vi.stubEnv("BUILD_COMMIT", "baked-into-the-image");
    stubNoIntegrationCredentials();

    await expect(
      getHealth({
        database: async () => undefined,
        redis: async () => undefined,
      }),
    ).resolves.toEqual({
      status: "ok",
      mode: "configured",
      release: "baked-into-the-image",
      dependencies: {
        database: "ok",
        redis: "ok",
      },
      integrations: NO_INTEGRATIONS,
      capabilities: DISABLED_CAPABILITIES,
    });
  });

  it("reports degraded when only the database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("BUILD_COMMIT", "");
    stubNoIntegrationCredentials();

    await expect(
      getHealth({
        database: async () => undefined,
      }),
    ).resolves.toEqual({
      status: "degraded",
      mode: "configured",
      release: null,
      dependencies: {
        database: "ok",
        redis: "not_configured",
      },
      integrations: NO_INTEGRATIONS,
      capabilities: DISABLED_CAPABILITIES,
    });
  });

  it("reports degraded when only Redis is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("BUILD_COMMIT", "");
    stubNoIntegrationCredentials();

    await expect(
      getHealth({
        redis: async () => undefined,
      }),
    ).resolves.toEqual({
      status: "degraded",
      mode: "configured",
      release: null,
      dependencies: {
        database: "not_configured",
        redis: "ok",
      },
      integrations: NO_INTEGRATIONS,
      capabilities: DISABLED_CAPABILITIES,
    });
  });

  it("reports a safe degraded response when a configured dependency fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@redis:6379");
    vi.stubEnv("BUILD_COMMIT", "");
    stubNoIntegrationCredentials();

    const health = await getHealth({
      database: async () => {
        throw new Error("postgresql://user:secret@database/linkar refused connection");
      },
      redis: async () => undefined,
    });

    expect(health).toEqual({
      status: "degraded",
      mode: "configured",
      release: null,
      dependencies: {
        database: "error",
        redis: "ok",
      },
      integrations: NO_INTEGRATIONS,
      capabilities: DISABLED_CAPABILITIES,
    });
    expect(JSON.stringify(health)).not.toContain("postgresql://");
    expect(JSON.stringify(health)).not.toContain("secret");
  });
});

describe("getHealth release provenance", () => {
  it("reports the commit baked into the image", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("BUILD_COMMIT", "baked-into-the-image");

    await expect(getHealth()).resolves.toMatchObject({ release: "baked-into-the-image" });
  });

  it("reports no release when the image has no baked commit", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("BUILD_COMMIT", "");
    await expect(getHealth()).resolves.toMatchObject({ release: null });
  });
});

describe("getHealth integrations", () => {
  it("reports Instagram and Facebook as unconfigured when no credentials are set", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("META_APP_ID", "");
    vi.stubEnv("META_APP_SECRET", "");
    vi.stubEnv("FACEBOOK_APP_ID", "");
    vi.stubEnv("FACEBOOK_APP_SECRET", "");

    const health = await getHealth({ database: async () => undefined, redis: async () => undefined });

    expect(health.integrations).toEqual({ instagram: "not_configured", facebook: "not_configured" });
  });

  it("requires both an app id and an app secret before calling an integration configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("META_APP_ID", "ig-app-id");
    vi.stubEnv("META_APP_SECRET", "");
    vi.stubEnv("FACEBOOK_APP_ID", "fb-app-id");
    vi.stubEnv("FACEBOOK_APP_SECRET", "fb-app-secret");

    const health = await getHealth({ database: async () => undefined, redis: async () => undefined });

    expect(health.integrations).toEqual({ instagram: "not_configured", facebook: "configured" });
  });

  it("keeps missing integration credentials out of the container health verdict", async () => {
    // The web container healthcheck fails on a non-2xx /api/health, so an
    // unconfigured integration must not make the service look unhealthy.
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("META_APP_ID", "");
    vi.stubEnv("META_APP_SECRET", "");

    const health = await getHealth({ database: async () => undefined, redis: async () => undefined });

    expect(health.status).toBe("ok");
  });

  it("never echoes an app secret into the response", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("META_APP_ID", "ig-app-id");
    vi.stubEnv("META_APP_SECRET", "super-secret-value");

    const health = await getHealth({ database: async () => undefined, redis: async () => undefined });

    expect(JSON.stringify(health)).not.toContain("super-secret-value");
    expect(JSON.stringify(health)).not.toContain("ig-app-id");
  });
});

describe("getHealth capabilities", () => {
  it.each([["true", "enabled"], ["false", "disabled"]] as const)("reports follow-gated campaigns as %s", async (configured, expected) => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("FOLLOW_GATED_CAMPAIGNS_ENABLED", configured);
    const health = await getHealth();
    expect(health.capabilities.followGatedCampaigns).toBe(expected);
    expect(JSON.stringify(health.capabilities)).not.toContain("FOLLOW_GATED_CAMPAIGNS_ENABLED");
  });
});

describe("public support pages", () => {
  it("renders the runtime support email and opts out of static rendering", async () => {
    vi.stubEnv("SUPPORT_EMAIL", "runtime-support@linkar.in");

    const pages = await Promise.all([
      import("../../app/privacy/page"),
      import("../../app/terms/page"),
      import("../../app/data-deletion/page"),
      import("../../app/support/page"),
    ]);

    expect(pages.map((page) => page.dynamic)).toEqual([
      "force-dynamic",
      "force-dynamic",
      "force-dynamic",
      "force-dynamic",
    ]);

    for (const page of pages) {
      expect(renderToStaticMarkup(createElement(page.default))).toContain("runtime-support@linkar.in");
    }
  });
});

describe("getHealth worker heartbeat", () => {
  const healthyDependencies = { database: async () => undefined, redis: async () => undefined };

  function stubConfigured() {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("BUILD_COMMIT", "web-release");
  }

  it("reports a fresh heartbeat and the release the worker is running", async () => {
    stubConfigured();
    const health = await getHealth({
      ...healthyDependencies,
      workerHeartbeat: async () => ({ at: Date.now() - 10_000, release: "worker-release" }),
    });
    expect(health.status).toBe("ok");
    expect(health.worker).toEqual({ heartbeat: "ok", release: "worker-release" });
    expect(isWebServing(health)).toBe(true);
  });

  it("degrades the status, but not the web container verdict, when the heartbeat is stale or missing", async () => {
    stubConfigured();
    const stale = await getHealth({
      ...healthyDependencies,
      // A clear margin past the cut-off: getHealth reads "now" before it calls
      // this reader, so a 1 ms margin raced on busy CI runners.
      workerHeartbeat: async () => ({ at: Date.now() - WORKER_HEARTBEAT_STALE_MS - 5_000, release: "old" }),
    });
    expect(stale.status).toBe("degraded");
    expect(stale.worker).toEqual({ heartbeat: "stale", release: "old" });
    expect(isWebServing(stale)).toBe(true);

    const missing = await getHealth({ ...healthyDependencies, workerHeartbeat: async () => null });
    expect(missing.worker).toEqual({ heartbeat: "stale", release: null });
    expect(missing.status).toBe("degraded");
  });

  it("reports a heartbeat read failure without echoing the error", async () => {
    stubConfigured();
    const health = await getHealth({
      ...healthyDependencies,
      workerHeartbeat: async () => {
        throw new Error("redis://:secret@valkey:6379 refused");
      },
    });
    expect(health.worker).toEqual({ heartbeat: "error", release: null });
    expect(JSON.stringify(health)).not.toContain("secret");
  });

  it("does not expect a worker in demo mode", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    const health = await getHealth({ workerHeartbeat: async () => null });
    expect(health.status).toBe("ok");
    expect(health.worker).toEqual({ heartbeat: "not_configured", release: null });
  });

  it("keeps the web container serving verdict tied to its own dependencies", async () => {
    stubConfigured();
    const health = await getHealth({
      database: async () => {
        throw new Error("down");
      },
      redis: async () => undefined,
    });
    expect(isWebServing(health)).toBe(false);
  });

  it("parses only well-formed heartbeat payloads", () => {
    expect(parseWorkerHeartbeat(JSON.stringify({ at: 5, release: "abc" }))).toEqual({ at: 5, release: "abc" });
    expect(parseWorkerHeartbeat(JSON.stringify({ at: 5 }))).toEqual({ at: 5, release: null });
    expect(parseWorkerHeartbeat("not json")).toBeNull();
    expect(parseWorkerHeartbeat(JSON.stringify({ release: "abc" }))).toBeNull();
    expect(parseWorkerHeartbeat(null)).toBeNull();
  });
});

describe("health detail access", () => {
  it("keeps detail private in production unless the configured token is presented", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HEALTH_DETAIL_TOKEN", "");
    expect(canViewHealthDetail(null)).toBe(false);
    expect(canViewHealthDetail("anything")).toBe(false);

    vi.stubEnv("HEALTH_DETAIL_TOKEN", "operator-health-token");
    expect(canViewHealthDetail(null)).toBe(false);
    expect(canViewHealthDetail("wrong")).toBe(false);
    expect(canViewHealthDetail("operator-health-token")).toBe(true);
  });

  it("shows detail in local development when no token is configured", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("HEALTH_DETAIL_TOKEN", "");
    expect(canViewHealthDetail(null)).toBe(true);
  });
});

describe("cached web health", () => {
  afterEach(() => {
    delete (globalThis as { linkarWebHealth?: unknown }).linkarWebHealth;
  });

  it("serves one probe result for five seconds", async () => {
    let calls = 0;
    const load = async () => {
      calls += 1;
      return getHealth();
    };
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    await getCachedWebHealth(load, 1_000);
    await getCachedWebHealth(load, 5_999);
    expect(calls).toBe(1);
    await getCachedWebHealth(load, 6_000);
    expect(calls).toBe(2);
  });

  it("does not cache a failed probe", async () => {
    const failing = () => Promise.reject(new Error("boom"));
    await expect(getCachedWebHealth(failing, 1_000)).rejects.toThrow("boom");
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    await expect(getCachedWebHealth(() => getHealth(), 1_001)).resolves.toMatchObject({ status: "ok" });
  });
});

describe("health probe deadline", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function stubConfigured() {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("BUILD_COMMIT", "");
    stubNoIntegrationCredentials();
  }

  const never = () => new Promise<never>(() => undefined);
  const answersAfter = (ms: number) => () => new Promise<void>((resolve) => setTimeout(resolve, ms));

  it("gives the database more time than Redis, and both fit the callers' 10 s timeouts", () => {
    expect(HEALTH_DATABASE_PROBE_TIMEOUT_MS).toBeGreaterThan(HEALTH_REDIS_PROBE_TIMEOUT_MS);
    // ops/dokploy/release-linkar.sh uses --max-time 10 and
    // scripts/check-production-health.mjs a 10 s timeout.
    expect(HEALTH_DATABASE_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(5_000);
  });

  it("reports a database that never answers as an error once its deadline passes", async () => {
    vi.useFakeTimers();
    stubConfigured();
    let settled = false;
    const pending = getHealth({ database: never, redis: async () => undefined }).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(HEALTH_DATABASE_PROBE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    const health = await pending;
    expect(health.dependencies).toEqual({ database: "error", redis: "ok" });
    expect(health.status).toBe("degraded");
    expect(isWebServing(health)).toBe(false);
  });

  it("reports Redis that never answers as an error once its shorter deadline passes", async () => {
    vi.useFakeTimers();
    stubConfigured();
    let settled = false;
    const pending = getHealth({ database: async () => undefined, redis: never }).finally(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(HEALTH_REDIS_PROBE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ dependencies: { database: "ok", redis: "error" } });
  });

  it("keeps a slow but working database ok past the Redis deadline", async () => {
    vi.useFakeTimers();
    stubConfigured();
    // Production measured about 0.9 to 1.2 s for the database probe at idle;
    // under pool pressure it runs longer without being down.
    const pending = getHealth({
      database: answersAfter(HEALTH_REDIS_PROBE_TIMEOUT_MS + 1_500),
      redis: async () => undefined,
    });

    await vi.advanceTimersByTimeAsync(HEALTH_REDIS_PROBE_TIMEOUT_MS + 1_500);

    const health = await pending;
    expect(health).toMatchObject({ status: "ok", dependencies: { database: "ok", redis: "ok" } });
    expect(isWebServing(health)).toBe(true);
  });

  it("bounds both dependency probes in parallel, not one after the other", async () => {
    vi.useFakeTimers();
    stubConfigured();
    let settled = false;
    const pending = getHealth({ database: never, redis: never }).finally(() => {
      settled = true;
    });

    // The whole check settles at the longest deadline, not the sum of both.
    await vi.advanceTimersByTimeAsync(HEALTH_DATABASE_PROBE_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);

    await expect(pending).resolves.toMatchObject({ dependencies: { database: "error", redis: "error" } });
  });

  it("reports a worker heartbeat read that never answers as an error after the Redis deadline", async () => {
    vi.useFakeTimers();
    stubConfigured();
    const pending = getHealth({ database: async () => undefined, redis: async () => undefined, workerHeartbeat: never });

    await vi.advanceTimersByTimeAsync(HEALTH_REDIS_PROBE_TIMEOUT_MS);

    const health = await pending;
    expect(health.worker).toEqual({ heartbeat: "error", release: null });
    // The worker never decides the web container's verdict.
    expect(isWebServing(health)).toBe(true);
  });

  it("still reports probes that answer inside their deadlines as ok", async () => {
    vi.useFakeTimers();
    stubConfigured();
    const pending = getHealth({
      database: answersAfter(HEALTH_DATABASE_PROBE_TIMEOUT_MS - 100),
      redis: answersAfter(HEALTH_REDIS_PROBE_TIMEOUT_MS - 100),
    });

    await vi.advanceTimersByTimeAsync(HEALTH_DATABASE_PROBE_TIMEOUT_MS);

    await expect(pending).resolves.toMatchObject({ status: "ok", dependencies: { database: "ok", redis: "ok" } });
  });
});

describe("health Redis client", () => {
  const healthGlobals = globalThis as unknown as {
    linkarHealthRedis?: { disconnect(): void };
    linkarHealthRedisUrl?: string;
    linkarHealthRedisPending?: unknown;
  };
  let server: Server | undefined;
  const sockets = new Set<Socket>();

  afterEach(async () => {
    healthGlobals.linkarHealthRedis?.disconnect();
    delete healthGlobals.linkarHealthRedis;
    delete healthGlobals.linkarHealthRedisUrl;
    delete healthGlobals.linkarHealthRedisPending;
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  /** A Valkey that accepts the connection and then never replies, like a SIGSTOPped one. */
  async function silentRedis(): Promise<string> {
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on("data", () => undefined);
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    return `redis://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  }

  it("gives up on a connected but silent Valkey instead of waiting forever", async () => {
    const client = await getHealthRedis(await silentRedis());
    const started = Date.now();
    const outcome = await Promise.race([
      client.ping().then(() => "answered", (error: Error) => error.message),
      new Promise<string>((resolve) => setTimeout(() => resolve("still pending"), 10_000)),
    ]);
    expect(outcome).toMatch(/timed out/i);
    expect(Date.now() - started).toBeLessThan(HEALTH_REDIS_PROBE_TIMEOUT_MS + 3_000);
  });

  it("reports a silent Valkey as an error from the default probe", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", await silentRedis());
    stubNoIntegrationCredentials();

    const health = await getHealth();

    expect(health.dependencies).toEqual({ database: "not_configured", redis: "error" });
    expect(isWebServing(health)).toBe(false);
  });
});
