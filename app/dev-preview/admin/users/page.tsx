import { notFound } from "next/navigation";

import { UsersScreen } from "@/src/components/admin/users-screen";
import { users } from "../fixtures";

export default function UsersPreview() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <UsersScreen page={users} />;
}
