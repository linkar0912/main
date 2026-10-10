import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createWorkerHealthServer, startWorkerHeartbeat } from "./worker-health";

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
    }, () => true);

    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        status: "ok",
        processing: "ok",
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

  it("reports 503 when BullMQ is not consuming despite healthy dependencies", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");

    const server = createWorkerHealthServer({
      database: async () => undefined,
      redis: async () => undefined,
    }, () => false);

    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/health`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({
        status: "degraded",
        processing: "error",
        dependencies: { database: "ok", redis: "ok" },
      });
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

describe("worker heartbeat", () => {
  it("beats with the baked release while the worker is listening and consuming, and stops on close", async () => {
    vi.stubEnv("BUILD_COMMIT", "worker-release");
    const beats: { at: number; release: string | null }[] = [];
    const server = createWorkerHealthServer({}, () => true, {
      heartbeat: async (beat) => {
        beats.push(beat);
      },
      heartbeatIntervalMs: 10,
    });

    await withServer(server, async () => {
      await vi.waitFor(() => expect(beats.length).toBeGreaterThanOrEqual(2));
    });
    expect(beats[0]).toMatchObject({ release: "worker-release" });
    expect(typeof beats[0]!.at).toBe("number");

    const afterClose = beats.length;
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(beats.length).toBe(afterClose);
  });

  it("does not beat while BullMQ is not consuming, so the web health sees a wedged worker", async () => {
    const write = vi.fn(async () => undefined);
    const stop = startWorkerHeartbeat(() => false, write, 10);
    await new Promise((resolve) => setTimeout(resolve, 50));
    stop();
    expect(write).not.toHaveBeenCalled();
  });

  it("survives a failed heartbeat write", async () => {
    const write = vi.fn(async () => {
      throw new Error("redis down");
    });
    const stop = startWorkerHeartbeat(() => true, write, 10);
    await vi.waitFor(() => expect(write.mock.calls.length).toBeGreaterThanOrEqual(2));
    stop();
  });
});
