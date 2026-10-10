"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Boxes,
  Cable,
  FileClock,
  Gauge,
  HeartPulse,
  KeyRound,
  LogOut,
  Menu,
  Rows3,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";

import { PRODUCT_NAME } from "@/src/lib/branding";
import { LinkarMark } from "@/src/components/linkar-mark";
import { ThemeToggle } from "@/src/components/theme-toggle";

// Grouped by what the owner is doing: looking around, managing accounts,
// fixing things, and the safety rails around all of it.
const operatorNavigation = [
  { label: null, items: [{ href: "/admin", label: "Overview", icon: Gauge }] },
  {
    label: "Accounts",
    items: [
      { href: "/admin/workspaces", label: "Workspaces", icon: Boxes },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/plans", label: "Plans and invites", icon: WalletCards },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/admin/operations", label: "Records", icon: Rows3 },
      { href: "/admin/integrations", label: "Connected accounts", icon: Cable },
      { href: "/admin/system", label: "Service health", icon: HeartPulse },
    ],
  },
  {
    label: "Safety",
    items: [
      { href: "/admin/deletions", label: "Delete data", icon: Trash2 },
      { href: "/admin/audit", label: "Audit log", icon: FileClock },
      { href: "/admin/security", label: "Your security", icon: KeyRound },
    ],
  },
] as const;

function initialsOf(email: string): string {
  const name = email.split("@")[0]?.replace(/[^a-z]/gi, "") ?? "";
  return (name.slice(0, 2) || "O").toUpperCase();
}

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
  // The development-only preview mounts the same screens under /dev-preview.
  const pathname = usePathname().replace(/^\/dev-preview(?=\/admin)/, "");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const restoreMenuFocus = useRef(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  function closeDrawer(restoreFocus = false) {
    setDrawerOpen(false);
    restoreMenuFocus.current = restoreFocus;
  }

  useEffect(() => {
    if (!drawerOpen && restoreMenuFocus.current) {
      restoreMenuFocus.current = false;
      menuButtonRef.current?.focus();
    }
  }, [drawerOpen]);

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
          <LinkarMark className="brand-mark" />
          <span className="brand-name">{PRODUCT_NAME}</span>
        </Link>
        <span className="sidebar-context">Owner console</span>
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
          <LinkarMark className="brand-mark" />
          <span className="brand-name">{PRODUCT_NAME}</span>
        </Link>

        <p className="sidebar-context">Owner console</p>

        {operatorNavigation.map((group) => (
          <nav className="sidebar-nav" aria-label={group.label ? `${group.label} sections` : "Operator sections"} key={group.label ?? "home"}>
            {group.label ? <span className="sidebar-label" aria-hidden>{group.label}</span> : null}
            {group.items.map(({ href, label, icon: Icon }) => {
              const active = isActive(pathname, href);
              return (
                <Link
                  key={href}
                  className={`sidebar-link ${active ? "is-active" : ""}`}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => closeDrawer()}
                >
                  <Icon size={18} strokeWidth={1.9} aria-hidden />
                  {label}
                </Link>
              );
            })}
          </nav>
        ))}

        <span className="sidebar-spacer" />
        <div className="admin-sidebar-foot">
          <Link className="sidebar-link" href="/dashboard">
            <ArrowLeft size={18} aria-hidden /> Back to workspace
          </Link>
          <ThemeToggle className="theme-toggle" showLabel />
          <form action="/api/auth/logout" method="post">
            <button className="signout-button" type="submit"><LogOut size={17} aria-hidden /> Sign out</button>
          </form>
          <div className="admin-owner">
            <span className="avatar" aria-hidden>{initialsOf(owner.email)}</span>
            <span><small>Signed in as</small><strong title={owner.email}>{owner.email}</strong></span>
          </div>
        </div>
      </aside>

      <div className="main-content" inert={drawerOpen} aria-hidden={drawerOpen || undefined}>{children}</div>
    </div>
  );
}
