import { readFileSync, rmSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { test as teardown } from "@playwright/test";
import { assertLocalE2ETarget, E2E_RUN_FILE, e2eServerMode, serverEnvValue, type E2ERun } from "./local-target";

function readRun(): E2ERun | null {
  try {
    return JSON.parse(readFileSync(E2E_RUN_FILE, "utf8")) as E2ERun;
  } catch {
    return null;
  }
}

// Removes the workspace owner the setup created, and the workspaces only that
// owner belongs to. Cleanup runs only against a local target: with
// E2E_ALLOW_REMOTE_DB=1 the account is left in place and reported instead.
teardown("remove the workspace owner", async () => {
  const run = readRun();
  if (!run) return;
  if (process.env.E2E_ALLOW_REMOTE_DB === "1") {
    console.warn(`e2e teardown: remote target allowed, so ${run.email} (${run.userId}) was not deleted`);
    return;
  }
  assertLocalE2ETarget();

  // The workspace rows live in the database the server used; only an
  // explicitly exported URL is touched.
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    try {
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
        if (others === 0) await prisma.workspace.delete({ where: { id: workspaceId } });
      }
    } finally {
      await prisma.$disconnect();
    }
  }

  const mode = e2eServerMode();
  const url = serverEnvValue("SUPABASE_URL", mode) ?? serverEnvValue("NEXT_PUBLIC_SUPABASE_URL", mode);
  const serviceRoleKey = serverEnvValue("SUPABASE_SERVICE_ROLE_KEY", mode);
  if (url && serviceRoleKey) {
    const response = await fetch(`${url}/auth/v1/admin/users/${run.userId}`, {
      method: "DELETE",
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok && response.status !== 404) {
      throw new Error(`e2e teardown: failed to delete ${run.email} (${response.status})`);
    }
  }
  rmSync(E2E_RUN_FILE, { force: true });
});
