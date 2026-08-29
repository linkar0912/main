import { NextResponse } from "next/server";
import { getServerEnv } from "@/src/lib/env";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { hashToken, createRawToken } from "@/src/lib/auth/tokens";
import { sendEmail } from "@/src/lib/mailer";
import type { MemberRole } from "@/src/lib/repository";

export const runtime = "nodejs";

const INVITABLE_ROLES = new Set(["ADMIN", "MEMBER"]);
const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1_000;

async function requireManager(request: Request) {
    const session = await getValidatedSession(request);
    if (!session) return { error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
    const repository = getRepository();
    const role = await repository.getMemberRole(session.workspaceId, session.email);
    if (role !== "OWNER" && role !== "ADMIN") {
        return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
    }
    return { session, role };
}

export async function GET(request: Request) {
    const guard = await requireManager(request);
    if ("error" in guard) return guard.error;
    const repository = getRepository();
    const [members, invitations] = await Promise.all([
        repository.listMembers(guard.session.workspaceId),
        repository.listInvitations(guard.session.workspaceId),
    ]);
    return NextResponse.json({
        members: members.map(({ email, role }) => ({ email, role })),
        invitations: invitations.map(({ id, email, role, expiresAt }) => ({ id, email, role, expiresAt })),
    });
}

export async function POST(request: Request) {
    const env = getServerEnv();
    const guard = await requireManager(request);
    if ("error" in guard) return guard.error;

    const body = await request.json().catch(() => null) as { email?: string; role?: string } | null;
    const email = String(body?.email ?? "").trim().toLowerCase();
    const role = String(body?.role ?? "MEMBER");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    if (!INVITABLE_ROLES.has(role)) {
        return NextResponse.json({ error: "invalid_role" }, { status: 400 });
    }

    const repository = getRepository();
    // An existing member cannot be re-invited; an OWNER seat is immutable.
    const members = await repository.listMembers(guard.session.workspaceId);
    if (members.some((member) => member.email === email)) {
        return NextResponse.json({ error: "already_member" }, { status: 409 });
    }

    const raw = createRawToken();
    const invitation = await repository.createInvitation({
        workspaceId: guard.session.workspaceId,
        email,
        role: role as Exclude<MemberRole, "OWNER">,
        tokenHash: hashToken(raw),
        invitedByUserId: guard.session.userId,
        expiresAt: new Date(Date.now() + INVITATION_TTL_MS).toISOString(),
    });
    await sendEmail({
        to: email,
        subject: "You're invited to a Linkar workspace",
        body: `Join your team's Linkar workspace with this link (valid for 7 days):
${env.appUrl}/signup?invite=${encodeURIComponent(raw)}

You will need to create an account with this exact email address.`,
    });
    return NextResponse.json({ id: invitation.id, email: invitation.email, role: invitation.role }, { status: 201 });
}

export async function DELETE(request: Request) {
    const guard = await requireManager(request);
    if ("error" in guard) return guard.error;
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const revoked = await getRepository().revokeInvitation(guard.session.workspaceId, id);
    return revoked
        ? NextResponse.json({ ok: true })
        : NextResponse.json({ error: "not_found" }, { status: 404 });
}