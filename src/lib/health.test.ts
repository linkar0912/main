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

describe("getHealth", () => {
  it("reports demo mode with unconfigured dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("SOURCE_COMMIT", "");
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
    });
  });

  it("reports configured healthy dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@redis:6379");
    vi.stubEnv("SOURCE_COMMIT", "coolify-commit-marker");
    stubNoIntegrationCredentials();

    await expect(
      getHealth({
        database: async () => undefined,
        redis: async () => undefined,
      }),
    ).resolves.toEqual({
      status: "ok",
      mode: "configured",
      release: "coolify-commit-marker",
      dependencies: {
        database: "ok",
        redis: "ok",
      },
      integrations: NO_INTEGRATIONS,
    });
  });

  it("reports degraded when only the database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("SOURCE_COMMIT", "");
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
    });
  });

  it("reports degraded when only Redis is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("SOURCE_COMMIT", "");
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
    });
  });

  it("reports a safe degraded response when a configured dependency fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@redis:6379");
    vi.stubEnv("SOURCE_COMMIT", "");
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
    });
    expect(JSON.stringify(health)).not.toContain("postgresql://");
    expect(JSON.stringify(health)).not.toContain("secret");
  });
});

describe("getHealth release provenance", () => {
  it("prefers the commit baked into the image over an operator-supplied one", async () => {
    // SOURCE_COMMIT is set by hand in Coolify and went 30 commits stale in
    // production, so the image-baked value has to win.
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("BUILD_COMMIT", "baked-into-the-image");
    vi.stubEnv("SOURCE_COMMIT", "stale-operator-value");

    await expect(getHealth()).resolves.toMatchObject({ release: "baked-into-the-image" });
  });

  it("falls back to the operator-supplied commit when the image has none", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("BUILD_COMMIT", "");
    vi.stubEnv("SOURCE_COMMIT", "operator-value");

    await expect(getHealth()).resolves.toMatchObject({ release: "operator-value" });
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
