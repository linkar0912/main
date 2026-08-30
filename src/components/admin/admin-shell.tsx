"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowLeft,
  Boxes,
  Cable,
  ChartNoAxesCombined,
  FileClock,
  Gauge,
  KeyRound,
  LogOut,
  Menu,
  PanelsTopLeft,
  ShieldCheck,
  Users,
  WalletCards,
} from "lucide-react";

import { PRODUCT_NAME } from "@/src/lib/branding";
import { ThemeToggle } from "@/src/components/theme-toggle";

const operatorNavigation = [
  { href: "/admin", label: "Overview", icon: Gauge },
  { href: "/admin/workspaces", label: "Workspaces", icon: Boxes },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/plans", label: "Plans", icon: WalletCards },
  { href: "/admin/operations", label: "Operations", icon: Activity },
  { href: "/admin/integrations", label: "Integrations", icon: Cable },
  { href: "/admin/system", label: "System", icon: ChartNoAxesCombined },
  { href: "/admin/audit", label: "Audit", icon: FileClock },
  { href: "/admin/security", label: "Security", icon: KeyRound },
] as const;

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminShell({
  owner,
  children,
}: Readonly<{
  owner: { email: string };
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function closeDrawer(restoreFocus = false) {
    setDrawerOpen(false);
    if (restoreFocus) menuButtonRef.current?.focus();
  }

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawer(true);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sidebarRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [drawerOpen]);

  return (
    <div className="app-frame admin-frame">
      <header className="mobile-topbar admin-mobile-topbar" inert={drawerOpen}>
        <button
          ref={menuButtonRef}
          className="hamburger"
          type="button"
          aria-label="Open operator navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
        </button>
        <Link className="brand" href="/admin" aria-label={`${PRODUCT_NAME} operator overview`}>
          <span className="brand-name">{PRODUCT_NAME}</span>
        </Link>
        <span className="admin-operator-rail">LINKAR OPERATOR</span>
      </header>

      {drawerOpen ? (
        <button className="scrim" type="button" aria-label="Close operator navigation" onClick={() => closeDrawer(true)} />
      ) : null}

      <aside
        ref={sidebarRef}
        className="sidebar admin-sidebar"
        data-open={String(drawerOpen)}
        aria-label="Operator sidebar"
        aria-modal={drawerOpen || undefined}
        role={drawerOpen ? "dialog" : undefined}
        tabIndex={-1}
      >
        <Link className="sidebar-brand" href="/admin">
          <span className="brand-name">{PRODUCT_NAME}</span>
        </Link>

        <div className="admin-operator-rail"><ShieldCheck size={15} aria-hidden /> LINKAR OPERATOR</div>
        <div className="workspace-chip admin-owner-chip">
          <span className="avatar" aria-hidden><PanelsTopLeft size={17} /></span>
          <span className="workspace-id">
            <strong>Platform owner</strong>
            <small>{owner.email}</small>
          </span>
        </div>

        <nav className="sidebar-nav" aria-label="Operator sections">
          {operatorNavigation.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                className={`sidebar-link ${active ? "is-active" : ""}`}
                href={href}
                aria-current={active ? "page" : undefined}
                onClick={() => closeDrawer()}
              >
                <Icon size={18} strokeWidth={1.9} />
                {label}
              </Link>
            );
          })}
        </nav>

        <span className="sidebar-spacer" />
        <Link className="sidebar-link admin-back-link" href="/dashboard">
          <ArrowLeft size={18} /> Back to workspace
        </Link>
        <ThemeToggle className="theme-toggle" showLabel />
        <form action="/api/auth/logout" method="post">
          <button className="signout-button" type="submit"><LogOut size={17} /> Sign out</button>
        </form>
      </aside>

      <div className="main-content" inert={drawerOpen} aria-hidden={drawerOpen || undefined}>{children}</div>
    </div>
  );
}
