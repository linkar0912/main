import "server-only";
import { prisma } from "@/src/lib/prisma";

export async function listDataDeletionRequests(status?: string) {
  return prisma.dataDeletionRequest.findMany({ where: status ? { status } : undefined, orderBy: [{ requestedAt: "desc" }, { id: "desc" }], take: 100, select: { id: true, status: true, requestedAt: true, completedAt: true } });
}
