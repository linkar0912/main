import { afterEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getHealth } from "./health";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getHealth", () => {
  it("reports demo mode with unconfigured dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("SOURCE_COMMIT", "");

    await expect(getHealth()).resolves.toEqual({
      status: "ok",
      mode: "demo",
      release: null,
      dependencies: {
        database: "not_configured",
        redis: "not_configured",
      },
    });
  });

  it("reports configured healthy dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/replyconnect");
    vi.stubEnv("REDIS_URL", "redis://:secret@redis:6379");
    vi.stubEnv("SOURCE_COMMIT", "coolify-commit-marker");

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
    });
  });

  it("reports degraded when only the database is configured", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/replyconnect");
    vi.stubEnv("REDIS_URL", "");
    vi.stubEnv("SOURCE_COMMIT", "");

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
    });
  });

  it("reports degraded when only Redis is configured", async () => {
    vi.stubEnv("DATABASE_URL", "");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("SOURCE_COMMIT", "");

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
    });
  });

  it("reports a safe degraded response when a configured dependency fails", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/replyconnect");
    vi.stubEnv("REDIS_URL", "redis://:secret@redis:6379");

    const health = await getHealth({
      database: async () => {
        throw new Error("postgresql://user:secret@database/replyconnect refused connection");
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
    });
    expect(JSON.stringify(health)).not.toContain("postgresql://");
    expect(JSON.stringify(health)).not.toContain("secret");
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
