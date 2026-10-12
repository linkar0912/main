import { readdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";
import { test as teardown } from "@playwright/test";
import { assertLocalE2ETarget, E2E_RUN_FILE, E2E_USERS_DIR, e2eServerMode, serverEnvValue, type E2ERun } from "./local-target";

function readRun(path: string): E2ERun | null {
  try {
    return JSON.parse(readFileSync(path, "utf8")) as E2ERun;
  } catch {
    return null;
  }
}

/** The shared owner from auth.setup.ts plus every account a spec created through e2e/fixtures.ts. */
function recordedRuns(): { run: E2ERun; file: string }[] {
  const files = [E2E_RUN_FILE];
  try {
    files.push(...readdirSync(E2E_USERS_DIR).filter((name) => name.endsWith(".json")).map((name) => join(E2E_USERS_DIR, name)));
  } catch {
    // No spec created an extra account.
  }
  return files.flatMap((file) => {
    const run = readRun(file);
    return run ? [{ run, file }] : [];
  });
}

// Removes the workspace owners the suite created, and the workspaces only
// those owners belong to. Cleanup runs only against a local target: with
// E2E_ALLOW_REMOTE_DB=1 the accounts are left in place and reported instead.
teardown("remove the workspace owner", async () => {
  const runs = recordedRuns();
  if (runs.length === 0) return;
  if (process.env.E2E_ALLOW_REMOTE_DB === "1") {
    for (const { run } of runs) console.warn(`e2e teardown: remote target allowed, so ${run.email} (${run.userId}) was not deleted`);
    return;
  }
  assertLocalE2ETarget();

  // The workspace rows live in the database the server used; only an
  // explicitly exported URL is touched.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
      for (const { run } of runs) {
        const memberships = await prisma.workspaceMember.findMany({
          where: { OR: [{ userId: run.userId }, { email: run.email }] },
          select: { workspaceId: true },
        });
        for (const { workspaceId } of memberships) {
          const others = await prisma.workspaceMember.count({
            where: { workspaceId, NOT: { OR: [{ userId: run.userId }, { email: run.email }] } },
          });
          // Every workspace relation cascades; a workspace someone else also
          // belongs to is not ours to delete.
          if (others === 0) await prisma.workspace.deleteMany({ where: { id: workspaceId } });
        }
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  const mode = e2eServerMode();
  const url = serverEnvValue("SUPABASE_URL", mode) ?? serverEnvValue("NEXT_PUBLIC_SUPABASE_URL", mode);
  const serviceRoleKey = serverEnvValue("SUPABASE_SERVICE_ROLE_KEY", mode);
  for (const { run, file } of runs) {
    if (url && serviceRoleKey) {
      const response = await fetch(`${url}/auth/v1/admin/users/${run.userId}`, {
        method: "DELETE",
        headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
      });
      if (!response.ok && response.status !== 404) {
        throw new Error(`e2e teardown: failed to delete ${run.email} (${response.status})`);
      }
    }
    rmSync(file, { force: true });
  }
});
