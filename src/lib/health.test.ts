import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  canViewHealthDetail,
  getCachedWebHealth,
  getHealth,
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
      workerHeartbeat: async () => ({ at: Date.now() - WORKER_HEARTBEAT_STALE_MS - 1, release: "old" }),
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
