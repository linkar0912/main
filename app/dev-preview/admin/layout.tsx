import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { AdminShell } from "@/src/components/admin/admin-shell";
import { OWNER_EMAIL } from "./fixtures";

// Development-only: renders the real owner-console screens with fixture data so
// they can be reviewed and screenshotted without Supabase auth and MFA. It is
// not linked anywhere and does not exist in production builds.
export const metadata: Metadata = { title: "Owner console preview", robots: { index: false, follow: false } };

export default function AdminPreviewLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AdminShell owner={{ email: OWNER_EMAIL }}>{children}</AdminShell>;
}
