import { notFound } from "next/navigation";

import { UserDetailScreen } from "@/src/components/admin/user-detail-screen";
import { userDetail } from "../../fixtures";

export default function UsersUseridPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UserDetailScreen user={userDetail} />;
}
