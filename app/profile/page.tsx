import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSessionToken, sessionCookieName, validateSessionState } from "@/src/lib/auth/session";
import { getServerEnv } from "@/src/lib/env";
import { getRepository } from "@/src/lib/repository-provider";
import { ProfileScreen } from "@/src/components/profile-screen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const env = getServerEnv();
    const cookieStore = await cookies();
    const token = cookieStore.get(sessionCookieName(env.appUrl))?.value;
    const repository = getRepository();
    const session = await validateSessionState(
        readSessionToken(token, env.authSessionSecret),
        repository,
    );
    if (!session) redirect("/login?next=%2Fprofile");

    const user = await repository.findUserById(session.userId);
    if (!user) redirect("/login");
    const role = await repository.getMemberRole(session.workspaceId, user.email);

    return (
        <ProfileScreen
            email={user.email}
            memberSince={user.createdAt}
            emailVerified={Boolean(user.emailVerifiedAt)}
            role={role ?? "MEMBER"}
        />
    );
}
