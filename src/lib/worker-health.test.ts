import { afterEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { consumersProcessing, createWorkerHealthServer, startWorkerHeartbeat } from "./worker-health";

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

  it("does not answer paths other than /health and /live", async () => {
    const server = createWorkerHealthServer({
      database: async () => undefined,
      redis: async () => undefined,
    });

    await withServer(server, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/`)).status).toBe(404);
      expect((await fetch(`${baseUrl}/live/extra`)).status).toBe(404);
    });
  });
});

describe("worker liveness", () => {
  /** Checkers that record a call, so a test can prove /live sends no dependency I/O. */
  function recordingCheckers() {
    const calls: string[] = [];
    return {
      calls,
      checkers: {
        database: async () => {
          calls.push("database");
        },
        redis: async () => {
          calls.push("redis");
        },
      },
    };
  }

  it("answers 200 while BullMQ is consuming, without probing the database or Redis", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    vi.stubEnv("BUILD_COMMIT", "worker-release");
    const { calls, checkers } = recordingCheckers();
    const server = createWorkerHealthServer(checkers, () => true, { heartbeat: false });

    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/live`);
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toBe("no-store");
      await expect(response.json()).resolves.toEqual({ status: "ok", release: "worker-release", processing: "ok" });
    });
    expect(calls).toEqual([]);
  });

  it("stays 200 when a dependency is down, which /health still reports", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://user:secret@database/linkar");
    vi.stubEnv("REDIS_URL", "redis://:secret@valkey:6379");
    const server = createWorkerHealthServer({
      database: async () => {
        throw new Error("postgresql://user:secret@database/linkar refused");
      },
      redis: async () => undefined,
    }, () => true, { heartbeat: false });

    await withServer(server, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/live`)).status).toBe(200);
      expect((await fetch(`${baseUrl}/health`)).status).toBe(503);
    });
  });

  it("answers 503 when BullMQ is not consuming", async () => {
    const server = createWorkerHealthServer({}, () => false, { heartbeat: false });

    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/live`);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toMatchObject({ status: "degraded", processing: "error" });
    });
  });

  it("answers 503 when the processing check throws, without echoing the error", async () => {
    const server = createWorkerHealthServer({}, () => {
      throw new Error("redis://:secret@valkey:6379 not ready");
    }, { heartbeat: false });

    await withServer(server, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/live`);
      expect(response.status).toBe(503);
      expect(await response.text()).not.toContain("secret");
    });
  });

  it("answers 503 inside the readiness timeout when the processing check hangs", async () => {
    const server = createWorkerHealthServer({}, () => new Promise<boolean>(() => undefined), { heartbeat: false });

    await withServer(server, async (baseUrl) => {
      const started = Date.now();
      const response = await fetch(`${baseUrl}/live`, { signal: AbortSignal.timeout(8_000) });
      expect(response.status).toBe(503);
      expect(Date.now() - started).toBeLessThan(5_000);
    });
  });
});

describe("consumersProcessing", () => {
  /** A BullMQ Worker stand-in; `blocking` adds the backend's dedicated blocking client. */
  function stubWorker(options: { running?: boolean; paused?: boolean; blocking?: { status?: string } | null } = {}) {
    return {
      isRunning: () => options.running ?? true,
      isPaused: () => options.paused ?? false,
      waitUntilReady: async () => undefined,
      ...(options.blocking !== undefined ? { backend: { blockingClient: Promise.resolve(options.blocking ?? undefined) } } : {}),
    };
  }
  const ready = { status: "ready" };

  it("is true when the main connection and BullMQ's blocking client are both ready", async () => {
    await expect(consumersProcessing([
      { consumer: stubWorker({ blocking: { status: "ready" } }), connection: ready },
      { consumer: stubWorker({ blocking: { status: "ready" } }), connection: ready },
    ])).resolves.toBe(true);
  });

  it("is false when a blocking client is stuck reconnecting while the main connection is ready", async () => {
    // What a Valkey outage can leave behind: jobs stop, the main connection looks fine.
    await expect(consumersProcessing([
      { consumer: stubWorker({ blocking: { status: "ready" } }), connection: ready },
      { consumer: stubWorker({ blocking: { status: "reconnecting" } }), connection: ready },
    ])).resolves.toBe(false);
  });

  it("keeps the main-connection check for a worker without the BullMQ internal", async () => {
    await expect(consumersProcessing([{ consumer: stubWorker(), connection: ready }])).resolves.toBe(true);
    await expect(consumersProcessing([{ consumer: stubWorker({ blocking: null }), connection: ready }])).resolves.toBe(true);
    await expect(consumersProcessing([{ consumer: stubWorker(), connection: { status: "reconnecting" } }])).resolves.toBe(false);
    await expect(consumersProcessing([{ consumer: stubWorker({ paused: true }), connection: ready }])).resolves.toBe(false);
    await expect(consumersProcessing([{ consumer: stubWorker({ running: false }), connection: ready }])).resolves.toBe(false);
  });

  it("turns /live to 503 when a blocking client is stuck", async () => {
    const consumer = stubWorker({ blocking: { status: "reconnecting" } });
    const server = createWorkerHealthServer({}, () => consumersProcessing([{ consumer, connection: ready }]), { heartbeat: false });
    await withServer(server, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/live`)).status).toBe(503);
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
