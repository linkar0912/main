import { AdminRouteGuard } from "@/src/components/admin/admin-route-guard";
import { DeletionConsole } from "@/src/components/admin/deletions/deletion-console";
import { listDeletionJobs } from "@/src/lib/admin/deletion/repository";
async function Data() { return <DeletionConsole jobs={await listDeletionJobs()} />; }
export default function AdminDeletionsPage() { return <AdminRouteGuard><Data /></AdminRouteGuard>; }
