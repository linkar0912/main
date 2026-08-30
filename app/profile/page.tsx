import { redirect } from "next/navigation";
import { getValidatedSession } from "@/src/lib/auth/session";
import { getRepository } from "@/src/lib/repository-provider";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { ProfileScreen } from "@/src/components/profile-screen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    // getValidatedSession() verifies the JWT locally (no network round trip);
    // it's the same fast path every other page uses via the workspace
    // bootstrap endpoint. getUser() is still needed for memberSince/
    // emailVerified (not present in the JWT claims), but runs concurrently
    // with it instead of blocking the auth check and workspace lookup behind
    // a slow network call first.
    const supabase = await createSupabaseServerClient();
    const [session, userResult] = await Promise.all([
        getValidatedSession(new Request("http://internal/profile")),
        supabase.auth.getUser(),
    ]);
    if (!session) redirect("/login?next=%2Fprofile");

    const role = await getRepository().getMemberRole(session.workspaceId, session.email);
    const user = userResult.data.user;

    return (
        <ProfileScreen
            email={session.email}
            memberSince={user?.created_at ?? null}
            emailVerified={Boolean(user?.email_confirmed_at)}
            role={role ?? "MEMBER"}
        />
    );
}
