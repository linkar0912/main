import { getRepository, getWorkspaceId } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

export async function GET() {
  const connections = await getRepository().listConnections(getWorkspaceId());
  return Response.json({
    data: connections.map(({ id, igUserId, username, status, connectedAt }) => ({
      id,
      igUserId,
      username,
      status,
      connectedAt,
    })),
  });
}
