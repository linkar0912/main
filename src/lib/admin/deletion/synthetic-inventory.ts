import "server-only";

import { getServerEnv } from "@/src/lib/env";
import { prisma } from "@/src/lib/prisma";
import { createSupabaseAdminClient } from "@/src/lib/supabase/admin";
import { buildSyntheticAccountInventory } from "./synthetic-accounts";

export async function loadSyntheticAccountInventory() {
  const supabase = createSupabaseAdminClient();
  return buildSyntheticAccountInventory({
    platformOwnerUserIds: getServerEnv().platformOwnerUserIds,
    async listAuthUsersPage(page, perPage) {
      const result = await supabase.auth.admin.listUsers({ page, perPage });
      if (result.error) throw result.error;
      return result.data.users.map((user) => ({ id: user.id, email: user.email }));
    },
    listMemberships: (userIds) => prisma.workspaceMember.findMany({
      where: { userId: { in: userIds } },
      select: { userId: true, workspaceId: true, role: true },
    }),
    listOwnedWorkspaceMemberships: (workspaceIds) => prisma.workspaceMember.findMany({
      where: { workspaceId: { in: workspaceIds } },
      select: { userId: true, workspaceId: true, role: true },
    }),
  });
}
