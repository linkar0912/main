import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import {
  consumersProcessing,
  createWorkerHealthServer,
  createWorkerShutdown,
  DEFAULT_LIVENESS_EXIT_AFTER_MS,
  livenessExitAfterMs,
  readLivenessExitAfterMs,
  RECENT_ACTIVITY_MS,
  startLivenessWatchdog,
  startWorkerHeartbeat,
  trackConsumerActivity,
} from "./worker-health";

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

  it("stays true for a worker working through a backlog after BullMQ's watchdog closed its blocking client", async () => {
    // BullMQ's stuck-command watchdog leaves the blocking client "end" and only
    // reconnects it on the next wait for a job, which a busy worker never does.
    // "connecting" and "connect" pass on their own, slowly against a slow Valkey.
    for (const status of ["end", "close", "connecting", "connect"]) {
      await expect(consumersProcessing([
        { consumer: stubWorker({ blocking: { status: "ready" } }), connection: ready },
        { consumer: stubWorker({ blocking: { status } }), connection: ready },
      ])).resolves.toBe(true);
    }
  });

  it("counts a consumer that took a job in the last minute as consuming, whatever its connections read", async () => {
    const now = () => 1_000_000;
    const stuck = stubWorker({ blocking: { status: "reconnecting" } });
    const recent = now() - (RECENT_ACTIVITY_MS - 1);
    const stale = now() - RECENT_ACTIVITY_MS;
    await expect(consumersProcessing([{ consumer: stuck, connection: ready, lastActivityAt: recent }], now)).resolves.toBe(true);
    await expect(consumersProcessing([{ consumer: stuck, connection: { status: "reconnecting" }, lastActivityAt: recent }], now)).resolves.toBe(true);
    // Activity a minute old proves nothing; the connection checks decide.
    await expect(consumersProcessing([{ consumer: stuck, connection: ready, lastActivityAt: stale }], now)).resolves.toBe(false);
    // A worker that is not running or is paused takes no more jobs, recent or not.
    await expect(consumersProcessing([{ consumer: stubWorker({ running: false }), connection: ready, lastActivityAt: recent }], now)).resolves.toBe(false);
    await expect(consumersProcessing([{ consumer: stubWorker({ paused: true }), connection: ready, lastActivityAt: recent }], now)).resolves.toBe(false);
  });

  it("judges each consumer on its own activity, so a busy one cannot hide a stuck one", async () => {
    const now = () => 1_000_000;
    await expect(consumersProcessing([
      { consumer: stubWorker({ blocking: { status: "ready" } }), connection: ready, lastActivityAt: now() - 1_000 },
      { consumer: stubWorker({ blocking: { status: "reconnecting" } }), connection: ready },
    ], now)).resolves.toBe(false);
  });

  it("turns /live to 503 when a blocking client is stuck", async () => {
    const consumer = stubWorker({ blocking: { status: "reconnecting" } });
    const server = createWorkerHealthServer({}, () => consumersProcessing([{ consumer, connection: ready }]), { heartbeat: false });
    await withServer(server, async (baseUrl) => {
      expect((await fetch(`${baseUrl}/live`)).status).toBe(503);
    });
  });
});

describe("trackConsumerActivity", () => {
  it("records when a worker last started, completed or failed a job", () => {
    let clock = 100;
    const consumer = new EventEmitter();
    const lastActivityAt = trackConsumerActivity(consumer, () => clock);
    expect(lastActivityAt()).toBeUndefined();
    for (const event of ["active", "completed", "failed"]) {
      clock += 1_000;
      consumer.emit(event, { id: "job" });
      expect(lastActivityAt()).toBe(clock);
    }
    // An empty queue is not activity.
    clock += 1_000;
    consumer.emit("drained");
    expect(lastActivityAt()).toBe(clock - 1_000);
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

describe("liveness watchdog", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** No jitter: every check exactly checkIntervalMs after the last one ends. */
  const steady = { random: () => 0.5 };

  /** Advances fake time in check-sized steps so each check's promise settles. */
  async function advance(ms: number, step = 1_000) {
    for (let elapsed = 0; elapsed < ms; elapsed += step) await vi.advanceTimersByTimeAsync(step);
  }

  it("exits once a worker that stopped consuming stays stopped for the whole window", async () => {
    vi.useFakeTimers();
    let processing = true;
    const onStuck = vi.fn();
    const stop = startLivenessWatchdog(() => processing, onStuck, { exitAfterMs: 60_000, checkIntervalMs: 1_000, ...steady });

    await advance(5_000);
    processing = false;
    await advance(59_000);
    expect(onStuck).not.toHaveBeenCalled();
    await advance(3_000);
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(onStuck.mock.calls[0]![0]).toBeGreaterThanOrEqual(60_000);

    // Once only, even if it stays stuck.
    await advance(120_000);
    expect(onStuck).toHaveBeenCalledTimes(1);
    stop();
  });

  it("starts over when consuming comes back, so a Valkey blip never restarts the worker", async () => {
    vi.useFakeTimers();
    let processing = false;
    const onStuck = vi.fn();
    const stop = startLivenessWatchdog(() => processing, onStuck, { exitAfterMs: 60_000, checkIntervalMs: 1_000, ...steady });

    await advance(50_000);
    processing = true;
    await advance(2_000);
    processing = false;
    await advance(50_000);
    expect(onStuck).not.toHaveBeenCalled();
    stop();
  });

  it("counts from launch, so a worker that never becomes ready exits too", async () => {
    vi.useFakeTimers();
    const onStuck = vi.fn();
    // Checks at 30 s and 60 s: only counting from launch reaches the window at
    // the second one; counting from the first failed check would need a third.
    const stop = startLivenessWatchdog(() => false, onStuck, { exitAfterMs: 60_000, checkIntervalMs: 30_000, ...steady });
    await advance(59_000);
    expect(onStuck).not.toHaveBeenCalled();
    await advance(2_000);
    expect(onStuck).toHaveBeenCalledTimes(1);
    expect(onStuck).toHaveBeenCalledWith(60_000);
    stop();
  });

  it("treats a check that throws or hangs as not consuming", async () => {
    vi.useFakeTimers();
    const throwing = vi.fn();
    const hanging = vi.fn();
    const stops = [
      startLivenessWatchdog(() => { throw new Error("redis gone"); }, throwing, { exitAfterMs: 60_000, checkIntervalMs: 5_000, ...steady }),
      startLivenessWatchdog(() => new Promise<boolean>(() => undefined), hanging, { exitAfterMs: 60_000, checkIntervalMs: 5_000, ...steady }),
    ];
    await advance(70_000);
    expect(throwing).toHaveBeenCalledTimes(1);
    expect(hanging).toHaveBeenCalledTimes(1);
    for (const stop of stops) stop();
  });

  it("does nothing when turned off, or after it is stopped", async () => {
    vi.useFakeTimers();
    const off = vi.fn();
    const stopped = vi.fn();
    startLivenessWatchdog(() => false, off, { exitAfterMs: 0, checkIntervalMs: 1_000 });
    const stop = startLivenessWatchdog(() => false, stopped, { exitAfterMs: 60_000, checkIntervalMs: 1_000 });
    await advance(10_000);
    stop();
    await advance(120_000);
    expect(off).not.toHaveBeenCalled();
    expect(stopped).not.toHaveBeenCalled();
  });

  it("drops a check that is still running when it is stopped", async () => {
    vi.useFakeTimers();
    const onStuck = vi.fn();
    let inFlight = false;
    // Each check takes 1.4 s, so check 25 starts at 58.6 s and would reach
    // the 60 s window when it ends at 60 s.
    const slowFalse = () => {
      inFlight = true;
      return new Promise<boolean>((resolve) => setTimeout(() => {
        inFlight = false;
        resolve(false);
      }, 1_400));
    };
    const stop = startLivenessWatchdog(slowFalse, onStuck, { exitAfterMs: 60_000, checkIntervalMs: 1_000, ...steady });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(inFlight).toBe(true);
    stop();
    await advance(120_000);
    expect(onStuck).not.toHaveBeenCalled();
  });

  it("jitters each check to between two thirds and four thirds of the interval", async () => {
    vi.useFakeTimers();
    for (const [random, firstCheckAt] of [[0, 10_000], [1, 20_000]] as const) {
      const isProcessing = vi.fn(() => true);
      const stop = startLivenessWatchdog(isProcessing, () => undefined, { exitAfterMs: 60_000, checkIntervalMs: 15_000, random: () => random });
      await vi.advanceTimersByTimeAsync(firstCheckAt - 1);
      expect(isProcessing).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(isProcessing).toHaveBeenCalledTimes(1);
      stop();
    }
  });

  it("measures the window on a monotonic clock, so a wall-clock jump does not shorten it", async () => {
    vi.useFakeTimers();
    const onStuck = vi.fn();
    const stop = startLivenessWatchdog(() => false, onStuck, { exitAfterMs: 60_000, checkIntervalMs: 1_000, ...steady });
    await advance(20_000);
    vi.setSystemTime(Date.now() + 10 * 60_000);
    await advance(20_000);
    expect(onStuck).not.toHaveBeenCalled();
    stop();
  });

  it("reads WORKER_LIVENESS_EXIT_AFTER_MS when no window is passed, as src/worker.ts runs it", async () => {
    vi.useFakeTimers();
    vi.stubEnv("WORKER_LIVENESS_EXIT_AFTER_MS", "0");
    const off = vi.fn();
    startLivenessWatchdog(() => false, off);
    await advance(20 * 60_000, 15_000);
    expect(off).not.toHaveBeenCalled();

    vi.stubEnv("WORKER_LIVENESS_EXIT_AFTER_MS", "60000");
    const onStuck = vi.fn();
    const stop = startLivenessWatchdog(() => false, onStuck);
    // A minute from launch, plus at most one jittered 20 s check.
    await advance(81_000);
    expect(onStuck).toHaveBeenCalledTimes(1);
    stop();
  });

  it("reads WORKER_LIVENESS_EXIT_AFTER_MS with a safe floor and default", () => {
    expect(livenessExitAfterMs(undefined)).toBe(DEFAULT_LIVENESS_EXIT_AFTER_MS);
    expect(livenessExitAfterMs("")).toBe(DEFAULT_LIVENESS_EXIT_AFTER_MS);
    expect(livenessExitAfterMs("0")).toBe(0);
    expect(livenessExitAfterMs("600000")).toBe(600_000);
    // Under a minute is raised to a minute; garbage and negatives fall back.
    expect(livenessExitAfterMs("5000")).toBe(60_000);
    expect(livenessExitAfterMs("soon")).toBe(DEFAULT_LIVENESS_EXIT_AFTER_MS);
    expect(livenessExitAfterMs("-1")).toBe(DEFAULT_LIVENESS_EXIT_AFTER_MS);
    expect(livenessExitAfterMs("1.5")).toBe(DEFAULT_LIVENESS_EXIT_AFTER_MS);
  });

  it("says why a configured window was not used as written, so the worker can log it", () => {
    expect(readLivenessExitAfterMs(undefined)).toEqual({ exitAfterMs: DEFAULT_LIVENESS_EXIT_AFTER_MS });
    expect(readLivenessExitAfterMs("0")).toEqual({ exitAfterMs: 0 });
    expect(readLivenessExitAfterMs("600000")).toEqual({ exitAfterMs: 600_000 });
    // "off" does not turn it off: only 0 does, and the warning says so.
    const off = readLivenessExitAfterMs("off");
    expect(off.exitAfterMs).toBe(DEFAULT_LIVENESS_EXIT_AFTER_MS);
    expect(off.warning).toContain('"off"');
    expect(off.warning).toContain("0 to turn it off");
    const short = readLivenessExitAfterMs("5000");
    expect(short.exitAfterMs).toBe(60_000);
    expect(short.warning).toContain("under a minute");
  });
});

describe("worker shutdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function shutdownWith(close: () => Promise<void>) {
    const exit = vi.fn();
    const log = { info: vi.fn(), error: vi.fn() };
    const onStart = vi.fn();
    const shutdown = createWorkerShutdown({ close, forceExitAfterMs: 30_000, exit, log, onStart });
    return { shutdown, exit, log, onStart };
  }

  it("closes once and exits with the code it was given", async () => {
    vi.useFakeTimers();
    const close = vi.fn(async () => undefined);
    const { shutdown, exit, onStart } = shutdownWith(close);
    await Promise.all([shutdown("liveness", 1), shutdown("SIGTERM")]);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(exit.mock.calls).toEqual([[1]]);
    // The forced exit is cancelled once the clean one has happened.
    await vi.advanceTimersByTimeAsync(60_000);
    expect(exit.mock.calls).toEqual([[1]]);

    const signal = shutdownWith(async () => undefined);
    await signal.shutdown("SIGTERM");
    expect(signal.exit.mock.calls).toEqual([[0]]);
  });

  it("forces the exit, with code 1 and a log line, when the close hangs on any signal", async () => {
    vi.useFakeTimers();
    for (const reason of ["SIGTERM", "liveness"]) {
      const { shutdown, exit, log } = shutdownWith(() => new Promise<void>(() => undefined));
      void shutdown(reason, reason === "liveness" ? 1 : 0);
      await vi.advanceTimersByTimeAsync(29_999);
      expect(exit).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(exit.mock.calls).toEqual([[1]]);
      expect(log.error).toHaveBeenCalledWith("Worker shutdown did not finish; forcing exit", { signal: reason, afterMs: 30_000 });
    }
  });

  it("exits with code 1 when the close fails", async () => {
    const { shutdown, exit, log } = shutdownWith(async () => {
      throw new Error("prisma gone");
    });
    await shutdown("SIGTERM");
    expect(exit.mock.calls).toEqual([[1]]);
    expect(log.error).toHaveBeenCalledWith("Worker shutdown failed", { error: "prisma gone" });
  });

  it("is what src/worker.ts runs: activity per consumer, the forced exit and the liveness exit", () => {
    const worker = readFileSync("src/worker.ts", "utf8");
    expect(worker).toContain("lastActivityAt: workerActivity()");
    expect(worker).toContain("lastActivityAt: bulkWorkerActivity()");
    expect(worker).toContain("forceExitAfterMs: SHUTDOWN_DRAIN_TIMEOUT_MS + 5_000");
    expect(worker).toMatch(/startLivenessWatchdog\(isProcessing, \(failingForMs\) => \{[\s\S]*?void shutdown\("liveness", 1\);\n  \}, \{ exitAfterMs: liveness\.exitAfterMs \}\);/);
  });
});
