import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { UsersScreen } from "@/src/components/admin/users-screen";
import { getAdminAccountsRepository } from "@/src/lib/admin/accounts-provider";

type SearchParams = Promise<{ cursor?: string | string[]; search?: string | string[] }>;
async function UsersData({ searchParams }: { searchParams: SearchParams }) { const input = await searchParams; const cursor = typeof input.cursor === "string" ? input.cursor : null; const search = typeof input.search === "string" ? input.search : ""; return <UsersScreen page={await getAdminAccountsRepository().listAdminUsers({ cursor, search })} search={search} />; }
export default function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) { return <AdminRouteGuard><UsersData searchParams={searchParams} /></AdminRouteGuard>; }
