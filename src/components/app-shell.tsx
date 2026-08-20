"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, LayoutDashboard, LogOut, Settings, Sparkles, Workflow } from "lucide-react";
import { PRODUCT_MARK, PRODUCT_NAME } from "@/src/lib/branding";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label={`${PRODUCT_NAME} overview`}>
          <span className="brand-mark">{PRODUCT_MARK}</span>
          <span>{PRODUCT_NAME}</span>
        </Link>

        <div className="workspace-switcher">
          <span className="workspace-avatar">{PRODUCT_MARK}</span>
          <span className="workspace-copy"><strong>{PRODUCT_NAME} workspace</strong><small>Owner workspace</small></span>
          <span className="workspace-caret">⌄</span>
        </div>

        <p className="sidebar-label">Workspace</p>
        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {navigation.map(({ href, label, icon: Icon }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link key={href} className={`sidebar-link ${active ? "is-active" : ""}`} href={href}>
                <Icon size={18} strokeWidth={1.8} />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-note">
            <Sparkles size={17} />
            <div><strong>No AI, by design</strong><span>Rules stay predictable.</span></div>
          </div>
          <Link className="sidebar-link" href="/support"><CircleHelp size={18} strokeWidth={1.8} /><span>Get support</span></Link>
          <form action="/api/auth/logout" method="post"><button className="sidebar-link sidebar-button" type="submit"><LogOut size={18} strokeWidth={1.8} /><span>Sign out</span></button></form>
          <div className="sidebar-footnote">Instagram-first automation<br />Built for Indian teams.</div>
        </div>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  );
}
