import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { buildSyntheticAccountInventory } from "../src/lib/admin/deletion/synthetic-accounts";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
    throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const platformOwnerUserIds = (process.env.PLATFORM_OWNER_USER_IDS ?? "")
    .split(",")
    .map((id) => id.trim().toLowerCase())
    .filter(Boolean);
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const inventory = await buildSyntheticAccountInventory({
      platformOwnerUserIds,
      async listAuthUsersPage(page, perPage) {
        const result = await supabase.auth.admin.listUsers({ page, perPage });
        if (result.error) throw result.error;
        return result.data.users.map((user) => ({ id: user.id, email: user.email }));
      },
      listMemberships: (userIds) => prisma.workspaceMember.findMany({
        where: { userId: { in: userIds } },
        select: { userId: true, workspaceId: true, role: true },
      }),
    });

    process.stdout.write(`${JSON.stringify({
      mode: "read-only",
      approvedPatternMatches: inventory.count,
      protectedAccountsExcluded: inventory.excludedProtectedCount,
      membershipsAffected: inventory.membershipCount,
      ownedWorkspacesAffected: inventory.ownedWorkspaceCount,
      digest: inventory.digest,
    })}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "synthetic_inventory_failed"}\n`);
  process.exitCode = 1;
});
