import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const duplicates = await prisma.$queryRawUnsafe(`
    SELECT "igUserId", COUNT(*)::int AS "connectionCount"
    FROM "InstagramConnection"
    GROUP BY "igUserId"
    HAVING COUNT(*) > 1
    ORDER BY "igUserId"
  `);

  if (duplicates.length > 0) {
    console.error(`Instagram ownership preflight failed: ${duplicates.length} account ID(s) belong to multiple connection rows.`);
    for (const duplicate of duplicates) console.error(`- ${duplicate.igUserId}: ${duplicate.connectionCount} connections`);
    process.exitCode = 1;
  } else {
    console.log("Instagram ownership preflight passed: no duplicate account IDs found.");
  }
} finally {
  await prisma.$disconnect();
}
