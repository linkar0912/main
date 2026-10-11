import { notFound } from "next/navigation";

import { UserDetailScreen } from "@/src/components/admin/user-detail-screen";
import { previewState, userDetail, userDetailLong } from "../../fixtures";

// ?state=long is a suspended, sign-in-blocked user with a long email.
export default async function UsersUseridPreview({ searchParams }: PageProps<"/dev-preview/admin/users/[userId]">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  return <UserDetailScreen user={state === "long" ? userDetailLong : state === "empty" ? { ...userDetail, workspaces: [], workspaceCount: 0, lastSignInAt: null } : userDetail} />;
}
