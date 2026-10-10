import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/src/components/app-shell";
import { PreviewFetch } from "./_preview/preview-fetch";

export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * Dev-only preview of the signed-in workspace: the real AppShell and the real
 * screens, fed by fixtures (./_preview/fixtures.ts) through a window.fetch
 * shim instead of the API, so they can be viewed and screenshotted without a
 * session or a database. Scenario via ?state=empty | error | slow.
 *
 * Deliberately imports no server data loaders (session, repository, prisma).
 */
export default function DevPreviewWorkspaceLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  if (process.env.NODE_ENV !== "development") notFound();
  return (
    <PreviewFetch>
      <AppShell>{children}</AppShell>
    </PreviewFetch>
  );
}
