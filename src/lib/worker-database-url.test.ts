import { describe, expect, it } from "vitest";
import { WORKER_DATABASE_CONNECTIONS, workerDatabaseUrl } from "./worker-database-url";

const direct = "postgresql://user:pass@pooler.example.com:5432/postgres";

describe("workerDatabaseUrl", () => {
  it("leaves the web app on its default (pooled) DATABASE_URL", () => {
    expect(workerDatabaseUrl({ role: undefined, directUrl: direct })).toBeUndefined();
    expect(workerDatabaseUrl({ role: "web", directUrl: direct })).toBeUndefined();
  });

  it("points the worker at the session pooler with a small connection cap", () => {
    const url = new URL(workerDatabaseUrl({ role: "worker", directUrl: direct })!);
    expect(url.port).toBe("5432");
    expect(url.searchParams.get("pgbouncer")).toBeNull();
    expect(url.searchParams.get("connection_limit")).toBe(String(WORKER_DATABASE_CONNECTIONS));
    expect(url.searchParams.get("pool_timeout")).toBe("10");
  });

  it("drops a pgbouncer flag and honours an explicit cap or worker URL", () => {
    const url = new URL(workerDatabaseUrl({ role: "worker", workerUrl: `${direct}?pgbouncer=true&connection_limit=3`, directUrl: direct })!);
    expect(url.searchParams.get("pgbouncer")).toBeNull();
    expect(url.searchParams.get("connection_limit")).toBe("3");
    expect(new URL(workerDatabaseUrl({ role: "worker", directUrl: direct, connections: "8" })!).searchParams.get("connection_limit")).toBe("8");
    expect(new URL(workerDatabaseUrl({ role: "worker", directUrl: direct, connections: "500" })!).searchParams.get("connection_limit")).toBe(String(WORKER_DATABASE_CONNECTIONS));
  });

  it("falls back to the default when asked to, when unset, or when the URL is malformed", () => {
    expect(workerDatabaseUrl({ role: "worker", mode: "pooled", directUrl: direct })).toBeUndefined();
    expect(workerDatabaseUrl({ role: "worker" })).toBeUndefined();
    expect(workerDatabaseUrl({ role: "worker", directUrl: "not a url" })).toBeUndefined();
  });
});
