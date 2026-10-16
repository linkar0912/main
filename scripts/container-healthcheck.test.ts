import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./container-healthcheck.mjs", import.meta.url));
const dockerfile = fileURLToPath(new URL("../Dockerfile", import.meta.url));
// Spawning node is slow on a loaded CI runner; none of these waits on a timeout.
const SPAWN_TEST_TIMEOUT_MS = 30_000;

type Endpoint = { port: number; paths: string[] };

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

/** A local stand-in for the web or worker health server that records each path it was asked for. */
async function serve(answer: (path: string, response: ServerResponse) => void): Promise<Endpoint> {
  const paths: string[] = [];
  const server = createServer((request, response) => {
    paths.push(request.url ?? "");
    answer(request.url ?? "", response);
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { port: (server.address() as AddressInfo).port, paths };
}

const status = (code: number) => (_path: string, response: ServerResponse) => {
  response.writeHead(code, { "content-type": "application/json" }).end("{}");
};

/** A port nothing listens on, so a connection to it is refused. */
async function closedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

function runHealthcheck(webPort: number, workerPort: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], {
      env: { ...process.env, PORT: String(webPort), WORKER_HEALTH_PORT: String(workerPort) },
      stdio: "ignore",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code));
  });
}

describe("container healthcheck", () => {
  it("passes on the web liveness route without asking for the dependency view", async () => {
    const web = await serve(status(200));
    const worker = await serve(status(200));

    await expect(runHealthcheck(web.port, worker.port)).resolves.toBe(0);
    expect(web.paths).toEqual(["/api/health/live"]);
    expect(worker.paths).toEqual([]);
  }, SPAWN_TEST_TIMEOUT_MS);

  it("fails on a web liveness error instead of falling through to the worker", async () => {
    const web = await serve(status(503));
    const worker = await serve(status(200));

    await expect(runHealthcheck(web.port, worker.port)).resolves.toBe(1);
    expect(worker.paths).toEqual([]);
  }, SPAWN_TEST_TIMEOUT_MS);

  it("falls through to the worker's liveness path when nothing listens on the web port", async () => {
    const worker = await serve(status(200));

    await expect(runHealthcheck(await closedPort(), worker.port)).resolves.toBe(0);
    expect(worker.paths).toEqual(["/live"]);
  }, SPAWN_TEST_TIMEOUT_MS);

  it("fails when the worker reports it is not consuming", async () => {
    const worker = await serve(status(503));

    await expect(runHealthcheck(await closedPort(), worker.port)).resolves.toBe(1);
    expect(worker.paths).toEqual(["/live"]);
  }, SPAWN_TEST_TIMEOUT_MS);

  it("fails when neither endpoint is listening", async () => {
    await expect(runHealthcheck(await closedPort(), await closedPort())).resolves.toBe(1);
  }, SPAWN_TEST_TIMEOUT_MS);

  it("does not follow a redirect away from the liveness route", async () => {
    const web = await serve((_path, response) => {
      response.writeHead(302, { location: "/api/health" }).end();
    });

    await expect(runHealthcheck(web.port, await closedPort())).resolves.toBe(1);
    expect(web.paths).toEqual(["/api/health/live"]);
  }, SPAWN_TEST_TIMEOUT_MS);

  it("gives up on a hung probe before Docker's own HEALTHCHECK timeout kills it", () => {
    const probeTimeoutMs = Number(/const PROBE_TIMEOUT_MS = ([\d_]+);/.exec(readFileSync(script, "utf8"))?.[1].replaceAll("_", ""));
    const dockerTimeoutSeconds = Number(/HEALTHCHECK [^\n]*--timeout=(\d+)s/.exec(readFileSync(dockerfile, "utf8"))?.[1]);

    expect(probeTimeoutMs).toBe(8_000);
    expect(dockerTimeoutSeconds).toBeGreaterThan(0);
    // Room for node itself to start inside Docker's budget.
    expect(dockerTimeoutSeconds * 1_000 - probeTimeoutMs).toBeGreaterThanOrEqual(1_500);
  });
});
