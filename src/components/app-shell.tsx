"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CircleHelp, LayoutDashboard, LogOut, Search, Sparkles, Workflow } from "lucide-react";
import { PRODUCT_MARK, PRODUCT_NAME } from "@/src/lib/branding";

const navigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/automations", label: "My automations", icon: Workflow },
  { href: "/support", label: "Get support", icon: CircleHelp },
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
          <span className="workspace-copy"><strong>My Workspace</strong><small>Owner workspace</small></span>
          <span className="workspace-caret">⌄</span>
        </div>

        <p className="sidebar-label">Menu</p>
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
          <form action="/api/auth/logout" method="post">
            <button className="sidebar-link sidebar-button" type="submit">
              <LogOut size={18} strokeWidth={1.8} />
              <span>Sign out</span>
            </button>
          </form>
          <div className="sidebar-footnote">Instagram-first automation<br />Built for Indian teams.</div>
        </div>
      </aside>

      <div className="main-content">
        <header className="main-topbar">
          <form action="/automations" className="topbar-search" role="search">
            <Search size={16} aria-hidden />
            <input name="q" type="search" placeholder="Search automations…" aria-label="Search automations" />
            <span className="topbar-kbd" aria-hidden>/</span>
          </form>
          <div className="topbar-profile">
            <span className="topbar-avatar" aria-hidden>{PRODUCT_MARK}</span>
            <span className="topbar-id"><strong>Owner</strong><small>{PRODUCT_NAME} workspace</small></span>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
