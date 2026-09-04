import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plans = [
    { id: "plan_free", key: "free", name: "Free", memberLimit: 1, automationLimit: 5, instagramConnectionLimit: 1, facebookConnectionLimit: 1, sequenceLimit: 0, monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 1_000, sequencesEnabled: false, broadcastsEnabled: false, trackedLinksEnabled: false, teamEnabled: false, facebookEnabled: true, exportsEnabled: false },
    { id: "plan_creator", key: "creator", name: "Creator", memberLimit: 2, automationLimit: 20, instagramConnectionLimit: 2, facebookConnectionLimit: 2, sequenceLimit: 10, monthlyBroadcastLimit: 0, monthlyDeliveryLimit: 5_000, sequencesEnabled: true, broadcastsEnabled: false, trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: false },
    { id: "plan_growth", key: "growth", name: "Growth", memberLimit: 5, automationLimit: 50, instagramConnectionLimit: 5, facebookConnectionLimit: 5, sequenceLimit: 25, monthlyBroadcastLimit: 10, monthlyDeliveryLimit: 25_000, sequencesEnabled: true, broadcastsEnabled: true, trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: true },
    { id: "plan_agency", key: "agency", name: "Agency", memberLimit: 10, automationLimit: 100, instagramConnectionLimit: 10, facebookConnectionLimit: 10, sequenceLimit: 50, monthlyBroadcastLimit: 25, monthlyDeliveryLimit: 50_000, sequencesEnabled: true, broadcastsEnabled: true, trackedLinksEnabled: true, teamEnabled: true, facebookEnabled: true, exportsEnabled: true },
  ] as const;

  for (const plan of plans) {
    await prisma.planDefinition.upsert({
      where: { key: plan.key },
      create: plan,
      update: { ...plan, id: undefined },
    });
  }

  await prisma.workspace.upsert({
    where: { id: "demo_workspace" },
    create: { id: "demo_workspace", name: "Linkar workspace", slug: "linkar" },
    update: { name: "Linkar workspace", slug: "linkar" },
  });
  await prisma.workspaceEntitlement.upsert({
    where: { workspaceId: "demo_workspace" },
    create: { workspaceId: "demo_workspace", planId: "plan_free" },
    update: {},
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());
