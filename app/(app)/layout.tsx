import { AppShell } from "@/src/components/app-shell";

// Shared shell for every authenticated workspace screen. Before this layout
// existed, each screen rendered its own <AppShell>, so every navigation
// unmounted the sidebar, dropped its state, and re-ran the workspace
// bootstrap. Mounted here, the shell renders once per session and only the
// page content swaps on navigation. The layout intentionally does no server
// work of its own so the pages inside the group stay static and prefetchable;
// the bootstrap payload is fetched once on the client and cached in
// src/lib/client/workspace-data.ts.
export default function WorkspaceAppLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <AppShell>{children}</AppShell>;
}
