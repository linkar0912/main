/**
 * The worker's database connection.
 *
 * The web app talks to Supabase through the transaction pooler (port 6543,
 * `pgbouncer=true`). In that mode Prisma wraps every statement in
 * BEGIN / DEALLOCATE ALL / prepare / execute / COMMIT - about five extra
 * round trips per query, and each round trip from the server to the database
 * region costs ~165 ms. The worker sits on the reply hot path, so it uses the
 * session pooler instead (WORKER_DATABASE_URL, else the same `DIRECT_URL`
 * migrations use: port 5432, no pgbouncer flag).
 *
 * Pool size: the WORKER_DATABASE_CONNECTIONS env var (1 to 20, default 5 from
 * the constant below; a `connection_limit` already in the URL wins).
 * DATABASE_URL's `connection_limit` does not apply here. This one pool serves
 * every WORKER_CONCURRENCY job, the bulk worker, the periodic sweeps and the
 * health check's `SELECT 1`, so jobs beyond it queue for a connection: a plain
 * query that finds the pool full waits up to 10 s (pool_timeout, P2024); an
 * interactive transaction waits up to its maxWait, 5 s by default
 * (TRANSACTION_DEFAULTS in src/lib/prisma.ts, P2028). Session-pooler
 * connections are held for the whole session: check the Supabase session pool
 * size before raising it.
 *
 * Returns undefined - keep Prisma's default `DATABASE_URL` and its
 * `connection_limit` - outside the worker, when neither WORKER_DATABASE_URL
 * nor DIRECT_URL is configured, or when WORKER_DATABASE_MODE is "pooled" (the
 * escape hatch if the session pool ever runs short).
 */
export type WorkerDatabaseEnv = {
  role: string | undefined;
  mode?: string;
  directUrl?: string;
  workerUrl?: string;
  connections?: string;
};

export const WORKER_DATABASE_CONNECTIONS = 5;

export function workerDatabaseUrl(env: WorkerDatabaseEnv): string | undefined {
  if (env.role !== "worker") return undefined;
  if (env.mode === "pooled") return undefined;
  const source = env.workerUrl || env.directUrl;
  if (!source) return undefined;
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return undefined;
  }
  url.searchParams.delete("pgbouncer");
  if (!url.searchParams.has("connection_limit")) {
    const requested = Number(env.connections);
    const limit = Number.isInteger(requested) && requested > 0 && requested <= 20 ? requested : WORKER_DATABASE_CONNECTIONS;
    url.searchParams.set("connection_limit", String(limit));
  }
  if (!url.searchParams.has("pool_timeout")) url.searchParams.set("pool_timeout", "10");
  return url.toString();
}
