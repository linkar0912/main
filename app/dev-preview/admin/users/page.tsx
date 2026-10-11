import { notFound } from "next/navigation";

import { UsersScreen } from "@/src/components/admin/users-screen";
import { previewState, users, usersEmpty, usersLong } from "../fixtures";

export default async function UsersPreview({ searchParams }: PageProps<"/dev-preview/admin/users">) {
  if (process.env.NODE_ENV !== "development") notFound();
  const state = previewState((await searchParams).state);
  return <UsersScreen page={state === "empty" ? usersEmpty : state === "long" ? usersLong : users} />;
}
