"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { CommandPalette } from "@/src/components/command-palette";
import { ADMIN_RECENT_KEY, adminPages } from "@/src/components/command-palette-items";
import { adminSources } from "@/src/components/command-palette-sources";
import { LinkarMark } from "@/src/components/linkar-mark";
import { ThemeMenuSwitch } from "@/src/components/theme-toggle";
import { AccountMenuButton, AccountMenuHead, MenuDivider, SearchTrigger, menuItemProps, usePaletteHotkey } from "@/src/components/top-bar";
import { friendlyFirstName } from "@/src/lib/display-name";
import { Presence, usePresence } from "@/src/components/ui/use-presence";
import { slidingThumbRef } from "@/src/components/ui/use-sliding-thumb";

const SEARCH_PLACEHOLDER = "Search workspaces, users, pages…";

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

// Meta deletion requests live under /admin/system but belong to Delete data,
// which is where their back link goes.
const sectionAliases: Record<string, string> = { "/admin/system/data-deletions": "/admin/deletions" };

function isActive(pathname: string, href: string): boolean {
  const alias = Object.entries(sectionAliases).find(([path]) => pathname === path || pathname.startsWith(`${path}/`));
  const current = alias ? alias[1] : pathname;
  return href === "/admin" ? current === href : current === href || current.startsWith(`${href}/`);
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
  const drawer = usePresence(drawerOpen);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const palettePages = useMemo(() => adminPages(), []);
  const paletteSources = useMemo(() => adminSources(), []);
  usePaletteHotkey(paletteOpen, setPaletteOpen);

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
      {drawer.mounted ? (
        <button className="scrim" type="button" aria-label="Close operator navigation" data-state={drawer.state} onClick={() => closeDrawer(true)} />
      ) : null}

      <aside
        ref={sidebarRef}
        className="sidebar admin-sidebar"
        data-open={String(drawerOpen)}
        data-state={drawer.mounted ? drawer.state : undefined}
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
          <nav ref={slidingThumbRef} className="sidebar-nav" aria-label={group.label ? `${group.label} sections` : "Operator sections"} key={group.label ?? "home"}>
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
          {/* A plain anchor, not next/link: /dashboard lives on the app host, and
              a client navigation fetches it from this host, follows the redirect
              and trips the console's CSP connect-src. A full page load follows
              the redirect without that check, and nothing is prefetched. */}
          <a className="sidebar-link" href="/dashboard">
            <ArrowLeft size={18} aria-hidden /> Back to workspace
          </a>
        </div>
      </aside>

      <div className="main-content" inert={drawerOpen} aria-hidden={drawerOpen || undefined}>
        <header className="app-topbar admin-topbar">
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
          <Link className="brand topbar-brand" href="/admin" aria-label={`${PRODUCT_NAME} operator overview`}>
            <LinkarMark className="brand-mark" />
            <span className="brand-name">{PRODUCT_NAME}</span>
          </Link>
          <SearchTrigger placeholder={SEARCH_PLACEHOLDER} onOpen={() => setPaletteOpen(true)} />
          <span className="topbar-spacer" />
          <AccountMenuButton
            label="Owner menu"
            menuId="owner-menu"
            avatar={<span className="avatar" aria-hidden>{initialsOf(owner.email)}</span>}
          >
            {(close) => (
              <>
                <AccountMenuHead
                  avatar={<span className="avatar" aria-hidden>{initialsOf(owner.email)}</span>}
                  name={friendlyFirstName(owner.email) ?? "Owner"}
                  email={owner.email}
                  meta="Owner console"
                />
                <MenuDivider />
                {/* Plain anchor for the same reason as the sidebar link. */}
                <a className="menu-item" href="/dashboard" {...menuItemProps} onClick={close}>
                  <ArrowLeft size={16} strokeWidth={1.9} aria-hidden />
                  <span className="menu-item-label">Back to workspace</span>
                </a>
                <ThemeMenuSwitch className="menu-item" />
                <MenuDivider />
                <form action="/api/auth/logout" method="post">
                  <button className="menu-item is-danger" type="submit" {...menuItemProps}>
                    <LogOut size={16} strokeWidth={1.9} aria-hidden />
                    <span className="menu-item-label">Sign out</span>
                  </button>
                </form>
              </>
            )}
          </AccountMenuButton>
        </header>
        {children}
      </div>

      <Presence>
        {paletteOpen ? (
          <CommandPalette
            label="Search the owner console"
            placeholder={SEARCH_PLACEHOLDER}
            pages={palettePages}
            actions={[]}
            sources={paletteSources}
            recentKey={ADMIN_RECENT_KEY}
            onClose={() => setPaletteOpen(false)}
          />
        ) : null}
      </Presence>
    </div>
  );
}
