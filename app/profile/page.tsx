import { redirect } from "next/navigation";
import { getRepository } from "@/src/lib/repository-provider";
import { createSupabaseServerClient } from "@/src/lib/supabase/server";
import { ProfileScreen } from "@/src/components/profile-screen";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user?.email) redirect("/login?next=%2Fprofile");

    const repository = getRepository();
    const workspaceId = await repository.findWorkspaceIdByMemberEmail(data.user.email);
    if (!workspaceId) redirect("/login");
    const role = await repository.getMemberRole(workspaceId, data.user.email);

    return (
        <ProfileScreen
            email={data.user.email}
            memberSince={data.user.created_at}
            emailVerified={Boolean(data.user.email_confirmed_at)}
            role={role ?? "MEMBER"}
        />
    );
}
