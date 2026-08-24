import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.workspace.upsert({
    where: { id: "demo_workspace" },
    create: { id: "demo_workspace", name: "Linkar workspace", slug: "linkar" },
    update: { name: "Linkar workspace", slug: "linkar" },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
