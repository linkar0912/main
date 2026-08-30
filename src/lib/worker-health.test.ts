import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createWorkerHealthServer } from "./worker-health";

afterEach(() => {
  vi.unstubAllEnvs();
});

/** Starts the server on an ephemeral port and tears it down after the callback. */
async function withServer(
  server: ReturnType<typeof createWorkerHealthServer>,
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("worker health server", () => {
  it("reports 200 and the dependency state when the worker can reach both dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");

    const server = createWorkerHealthServer({
      database: async () => undefined,
      redis: async () => undefined,
    });

    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "ok",
        dependencies: { database: "ok", redis: "ok" },
      });
    });
  });

  it("reports 503 when a dependency the worker needs is unreachable", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");

    const server = createWorkerHealthServer({
      database: async () => undefined,
      redis: async () => {
        throw new Error("redis://:secret@valkey:6379 connection refused");
      },
    });

    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(503);
      // A failing probe must not leak the credential-bearing connection string.
      expect(await response.text()).not.toContain("secret");
    });
  });

  it("does not answer paths other than /health", async () => {
    const server = createWorkerHealthServer({
      database: async () => undefined,
      redis: async () => undefined,
    });

    await withServer(server, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/`)).status).toBe(404);
    });
  });
});
