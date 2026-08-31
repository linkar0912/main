import { PrismaClient } from "@prisma/client";
import { createClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";

function normalizedEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function backfillMemberUserIds({ users, members }) {
  const authUsersByEmail = new Map();
  for (const user of users) {
    const email = normalizedEmail(user.email);
    if (!email) continue;
    if (authUsersByEmail.has(email) && authUsersByEmail.get(email) !== user.id) {
      throw new Error("ambiguous_auth_email");
    }
    authUsersByEmail.set(email, user.id);
  }

  const updates = [];
  let alreadyBound = 0;
  let unmatched = 0;
  for (const member of members) {
    const userId = authUsersByEmail.get(normalizedEmail(member.email));
    if (!userId) {
      unmatched += 1;
      continue;
    }
    if (member.userId === userId) {
      alreadyBound += 1;
      continue;
    }
    if (member.userId) {
      throw new Error("membership_user_conflict");
    }
    updates.push({ memberId: member.id, userId });
  }
  return { updates, alreadyBound, unmatched };
}

async function loadAllAuthUsers(supabase) {
  const users = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users.map((user) => ({ id: user.id, email: user.email ?? null })));
    if (data.users.length < 1000) break;
  }
  return users;
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!databaseUrl || !supabaseUrl || !serviceRoleKey) {
    throw new Error("DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  try {
    const [users, members] = await Promise.all([
      loadAllAuthUsers(supabase),
      prisma.workspaceMember.findMany({ select: { id: true, email: true, userId: true } }),
    ]);
    const result = backfillMemberUserIds({ users, members });
    for (const update of result.updates) {
      const changed = await prisma.workspaceMember.updateMany({
        where: { id: update.memberId, userId: null },
        data: { userId: update.userId },
      });
      if (changed.count !== 1) throw new Error("membership_changed_during_backfill");
    }
    process.stdout.write(JSON.stringify({
      updated: result.updates.length,
      alreadyBound: result.alreadyBound,
      unmatched: result.unmatched,
    }) + "\n");
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "backfill_failed"}\n`);
    process.exitCode = 1;
  });
}
