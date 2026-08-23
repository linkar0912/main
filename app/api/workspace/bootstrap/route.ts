import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { loadProfilePictureUrl } from "@/src/lib/meta/profile-picture";
import { getRepository } from "@/src/lib/repository-provider";

export const runtime = "nodejs";

// GET /api/workspace/bootstrap - one round trip for the app shell: account
// identity, plan, and the connected Instagram avatar (null when unavailable).
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const env = getServerEnv();
    const repository = getRepository();
    const user = await repository.findUserById(session.userId);
    if (!user) return NextResponse.json({ error: "Account not found" }, { status: 404 });
    const [role, connections] = await Promise.all([
        repository.getMemberRole(session.workspaceId, user.email),
        repository.listConnections(session.workspaceId).catch(() => []),
    ]);

    const first = connections[0];
    const igAvatarUrl = first
        ? await loadProfilePictureUrl(env, first.igUserId, first.accessTokenEncrypted)
        : null;

    return NextResponse.json({
        data: {
            email: user.email,
            role: role ?? "MEMBER",
            plan: "free",
            igAvatarUrl,
        },
    });
}

