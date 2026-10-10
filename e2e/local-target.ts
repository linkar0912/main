import { readFileSync } from "node:fs";

/**
 * The e2e suite signs up a real workspace owner, migrates the database, and
 * deletes what it created afterwards. It must never do that to a shared or
 * production project, so every entry point (playwright.config.ts, the setup,
 * and the teardown) checks the target first.
 *
 * The check reads what the Next.js server will see - the process environment
 * plus the .env files Next loads - because `pnpm dev`/`pnpm start` pick up
 * .env.local on their own. Those files are only read to refuse; nothing in
 * the suite takes a database URL from them.
 */

// Loopback, plus the service hostnames used when e2e runs inside a compose or
// CI container network.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]", "0.0.0.0", "postgres", "host.docker.internal"]);

const TARGET_VARIABLES = ["DATABASE_URL", "DIRECT_URL", "SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL"] as const;

function parseEnvFile(path: string): Record<string, string> {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const values: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    values[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, "$2");
  }
  return values;
}

/** The value Next.js will resolve for `name`: process env wins, then .env files in Next's order. */
export function serverEnvValue(name: string, mode: "development" | "production"): string | undefined {
  if (process.env[name]) return process.env[name];
  for (const file of [`.env.${mode}.local`, ".env.local", `.env.${mode}`, ".env"]) {
    const value = parseEnvFile(file)[name];
    if (value) return value;
  }
  return undefined;
}

function hostOf(value: string): string | null {
  try {
    return new URL(value).hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function e2eServerMode(): "development" | "production" {
  return process.env.CI ? "production" : "development";
}

/** Throws unless every database and Supabase target is local (or remote use is explicitly allowed). */
export function assertLocalE2ETarget(mode = e2eServerMode()): void {
  if (process.env.E2E_ALLOW_REMOTE_DB === "1") return;
  const remote = TARGET_VARIABLES.flatMap((name) => {
    const value = serverEnvValue(name, mode);
    if (!value) return [];
    const host = hostOf(value);
    return host && LOCAL_HOSTS.has(host) ? [] : [`${name} (${host ?? "unparseable URL"})`];
  });
  if (remote.length > 0) {
    throw new Error(
      `Refusing to run e2e: ${remote.join(", ")} is not local. The suite migrates the database and creates `
      + "and deletes users. Point it at a local stack (docker compose + `supabase start`), or set "
      + "E2E_ALLOW_REMOTE_DB=1 if you really mean to use a disposable remote project.",
    );
  }
}

export const E2E_RUN_FILE = ".playwright/e2e-run.json";

export type E2ERun = { email: string; userId: string };
