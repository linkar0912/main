import { NextResponse } from "next/server";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { getRuntimeMode } from "@/src/lib/health";
import { loadProfilePictureUrl } from "@/src/lib/meta/profile-picture";
import { getRepository } from "@/src/lib/repository-provider";
import { getEntitlementService } from "@/src/lib/entitlements/service";
import { measureServerOperation } from "@/src/lib/server-timing";

export const runtime = "nodejs";

// GET /api/workspace/bootstrap - one round trip for the app shell: account
// identity, plan, and the connected Instagram avatar (null when unavailable).
export async function GET(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const env = getServerEnv();
    const repository = getRepository();
    const [role, connections, entitlements] = await measureServerOperation(
        "workspace.bootstrap.repository",
        () => Promise.all([
            repository.getMemberRole(session.workspaceId, session.email),
            repository.listConnections(session.workspaceId).catch(() => []),
            getEntitlementService().getEffectiveEntitlements(session.workspaceId),
        ]),
    );

    const first = connections[0];
    const igAvatarUrl = first
        ? await measureServerOperation(
            "workspace.bootstrap.avatar",
            () => loadProfilePictureUrl(env, first.igUserId, first.accessTokenEncrypted),
        )
        : null;

    return NextResponse.json({
        data: {
            email: session.email,
            role: role ?? "MEMBER",
            plan: entitlements.planKey,
            planName: entitlements.planName,
            igAvatarUrl,
            platformOwner: env.platformOwnerUserIds.includes(session.userId.toLowerCase()),
            // Read at request time (never baked into the image build) so the
            // help centre can render statically and still show Coolify's value.
            supportEmail: env.supportEmail,
            // Config-only, no I/O. Home and Settings used to call /api/health
            // for this one field, paying a Redis connect plus a `SELECT 1` on
            // every mount and every window focus.
            mode: getRuntimeMode(),
        },
    });
}
