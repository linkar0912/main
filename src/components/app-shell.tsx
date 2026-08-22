"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  CircleHelp,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Search,
  Settings,
  Sparkles,
  Workflow,
} from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { InstagramGlyph } from "./instagram-glyph";

/** Labelled destinations in the header. */
const primaryNavigation = [
  { href: "/", label: "Overview" },
  { href: "/automations", label: "Automations" },
  { href: "/automations/sequences", label: "Sequences" },
  { href: "/settings", label: "Settings" },
];

/** The same map plus shortcuts, as the compact icon column. */
const railNavigation = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/automations/templates", label: "Templates", icon: Sparkles },
  { href: "/automations/sequences", label: "Sequences", icon: ListOrdered },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /automations must not light up while /automations/sequences is open.
  if (href === "/automations") {
    return pathname === "/automations" || pathname.startsWith("/automations/new")
      || /^\/automations\/[^/]+\/(edit|activity)$/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();

  return (
    <div className="app-frame">
      <header className="app-topbar">
        <Link className="brand" href="/" aria-label={`${PRODUCT_NAME} overview`}>
          <span className="brand-mark" aria-hidden>
            <InstagramGlyph size={18} />
          </span>
          <span className="brand-name">{PRODUCT_NAME}</span>
        </Link>

        <nav className="topnav" aria-label="Sections">
          {primaryNavigation.map(({ href, label }) => (
            <Link
              key={href}
              className={`topnav-pill ${isActive(pathname, href) ? "is-active" : ""}`}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>

        <div className="topbar-actions">
          <form action="/automations" className="topbar-search" role="search">
            <Search size={15} aria-hidden />
            <input
              name="q"
              type="search"
              placeholder="Search automations…"
              aria-label="Search automations"
            />
          </form>
          <span className="topbar-profile">
            <span className="topbar-avatar" aria-hidden>
              <InstagramGlyph size={15} />
            </span>
            <span className="topbar-id">
              <strong>Owner</strong>
              <small>{PRODUCT_NAME} workspace</small>
            </span>
          </span>
        </div>
      </header>

      <div className="app-body">
        <aside className="icon-rail" aria-label="Workspace navigation">
          <div className="rail-group">
            {railNavigation.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                className={`rail-link ${isActive(pathname, href) ? "is-active" : ""}`}
                href={href}
                title={label}
                aria-label={label}
                aria-current={isActive(pathname, href) ? "page" : undefined}
              >
                <Icon size={18} strokeWidth={1.9} />
              </Link>
            ))}
          </div>

          <div className="rail-group rail-bottom">
            <Link className="rail-link" href="/support" title="Get support" aria-label="Get support">
              <CircleHelp size={18} strokeWidth={1.9} />
            </Link>
            <form action="/api/auth/logout" method="post">
              <button className="rail-link rail-button" type="submit" title="Sign out" aria-label="Sign out">
                <LogOut size={18} strokeWidth={1.9} />
              </button>
            </form>
          </div>
        </aside>

        <div className="main-content">{children}</div>
      </div>
    </div>
  );
}
