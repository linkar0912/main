import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.workspace.upsert({
    where: { id: "demo_workspace" },
    create: { id: "demo_workspace", name: "ReplyConnect workspace", slug: "replyconnect" },
    update: { name: "ReplyConnect workspace", slug: "replyconnect" },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
