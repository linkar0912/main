import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getHealth } from "./health";

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
