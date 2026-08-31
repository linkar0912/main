import { notFound } from "next/navigation";
import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { UserDetailScreen } from "@/src/components/admin/user-detail-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";

async function UserData({ userId }: { userId: string }) { const user = await getAdminAccountsRepository().getAdminUser(userId); if (!user) notFound(); return <UserDetailScreen user={user} />; }
export default async function AdminUserPage({ params }: PageProps<"/admin/users/[userId]">) { const { userId } = await params; return <AdminRouteGuard><UserData userId={userId} /></AdminRouteGuard>; }
