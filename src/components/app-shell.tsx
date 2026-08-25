"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  CircleHelp,
  Inbox,
  LayoutDashboard,
  ListOrdered,
  LogOut,
  Megaphone,
  Menu,
  Moon,
  Settings,
  Sun,
  UserRound,
  Workflow,
} from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { getWorkspaceBootstrap } from "@/src/lib/client/workspace-data";
import { Skeleton } from "./skeleton";

/** Workspace destinations in the sidebar. */
const workspaceNavigation = [
  { href: "/", label: "Home", icon: LayoutDashboard },
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/automations/sequences", label: "Sequences", icon: ListOrdered },
  { href: "/automations/broadcasts", label: "Broadcasts", icon: Megaphone },
  { href: "/activity", label: "Activity", icon: Inbox },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** Personal destinations pinned to the bottom, like a profile drawer. */
const accountNavigation = [
  { href: "/profile", label: "My Profile", icon: UserRound },
  { href: "/help", label: "Help", icon: CircleHelp },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /automations must not light up while /automations/sequences or /automations/broadcasts is open.
  if (href === "/automations") {
    return pathname === "/automations" || pathname.startsWith("/automations/new")
      || /^\/automations\/[^/]+\/(edit|activity)$/.test(pathname);
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The current theme lives on <html data-theme>, applied pre-paint by the inline
 * script in the root layout. The store observes that attribute so every mounted
 * shell stays in sync without duplicating state. */
function subscribeToTheme(callback: () => void) {
  const observer = new MutationObserver(callback);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
function getThemeSnapshot(): "dark" | "light" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function getThemeServerSnapshot(): "dark" | "light" {
  return "light";
}

function setStoredTheme(theme: "dark" | "light") {
  if (theme === "dark") document.documentElement.dataset.theme = "dark";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem("linkar-theme", theme);
  } catch {
    // Private-mode storage failures just mean the choice does not persist.
  }
}

export type AccountIdentity = { email: string; plan: string; role: "OWNER" | "ADMIN" | "MEMBER" };
type AccountIdentityState = Omit<AccountIdentity, "role"> & { role: AccountIdentity["role"] | "" };

const AccountIdentityContext = createContext<AccountIdentityState>({ email: "", plan: "free", role: "" });

export function useAccountIdentity(): AccountIdentityState {
  return useContext(AccountIdentityContext);
}

function displayRole(role: AccountIdentity["role"] | ""): string {
  if (!role) return "Workspace";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

function initialsOf(email: string): string {
  const handle = email.split("@")[0] ?? "";
  const cleaned = handle.replace(/[^a-zA-Z0-9]/g, " ").trim();
  if (!cleaned) return "OW";
  if (cleaned.includes(" ")) {
    return cleaned.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? "").join("");
  }
  return cleaned.slice(0, 2).toUpperCase();
}


export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountIdentity["role"] | "">("");
  const [plan, setPlan] = useState("free");
  const [igAvatarUrl, setIgAvatarUrl] = useState("");
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getThemeServerSnapshot);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);

  const closeDrawer = () => setDrawerOpen(false);
  const closeDrawerAndRestoreFocus = () => {
    setDrawerOpen(false);
    menuButtonRef.current?.focus();
  };

  useEffect(() => {
    getWorkspaceBootstrap()
      .then((data) => {
        setEmail(data.email ?? "");
        setRole(data.role ?? "");
        setPlan(data.plan ?? "free");
        setIgAvatarUrl(data.igAvatarUrl ?? "");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!drawerOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sidebarRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDrawerAndRestoreFocus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(sidebarRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (focusable.length === 0) {
        event.preventDefault();
        sidebarRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === sidebarRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === sidebarRef.current)) {
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
    <AccountIdentityContext.Provider value={{ email, role, plan }}>
      <div className="app-frame">
      <header className="mobile-topbar" inert={drawerOpen}>
        <button
          ref={menuButtonRef}
          className="hamburger"
          type="button"
          aria-label="Open navigation"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <Menu size={20} />
        </button>
        <Link className="brand" href="/" aria-label={`${PRODUCT_NAME} overview`}>
          <span className="brand-name">{PRODUCT_NAME}</span>
        </Link>
      </header>

      {drawerOpen && (
        <button className="scrim" type="button" aria-label="Close navigation" onClick={closeDrawerAndRestoreFocus} />
      )}

      <aside
        ref={sidebarRef}
        className="sidebar"
        data-open={String(drawerOpen)}
        aria-label="Workspace sidebar"
        aria-modal={drawerOpen || undefined}
        role={drawerOpen ? "dialog" : undefined}
        tabIndex={-1}
      >
        <Link className="sidebar-brand" href="/">
          <span className="brand-name">{PRODUCT_NAME}</span>
        </Link>

        {role === "" ? (
          <Skeleton style={{ height: 52, borderRadius: 12 }} />
        ) : (
          <div className="workspace-chip">
            {igAvatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; next/image adds no value for one remote photo.
              <img className="avatar is-photo" src={igAvatarUrl} alt="Instagram profile picture" />
            ) : (
              <span className="avatar" aria-hidden>{initialsOf(email)}</span>
            )}
            <span className="workspace-id">
              <strong>{displayRole(role)}</strong>
              <small>{email || `${PRODUCT_NAME} workspace`}</small>
            </span>
            <span className="plan-tag">{plan}</span>
          </div>
        )}

        <nav className="sidebar-nav" aria-label="Workspace sections">
          {workspaceNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              className={`sidebar-link ${isActive(pathname, href) ? "is-active" : ""}`}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              onClick={closeDrawer}
            >
              <Icon size={18} strokeWidth={1.9} />
              {label}
            </Link>
          ))}
        </nav>

        <hr className="sidebar-divider" />

        <nav className="sidebar-nav" aria-label="Account">
          {accountNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              className={`sidebar-link ${isActive(pathname, href) ? "is-active" : ""}`}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              onClick={closeDrawer}
            >
              <Icon size={18} strokeWidth={1.9} />
              {label}
            </Link>
          ))}
        </nav>

        <span className="sidebar-spacer" />

        <button
          className="theme-toggle"
          type="button"
          onClick={() => setStoredTheme(theme === "dark" ? "light" : "dark")}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={17} strokeWidth={1.9} /> : <Moon size={17} strokeWidth={1.9} />}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        <form action="/api/auth/logout" method="post">
          <button className="signout-button" type="submit">
            <LogOut size={17} strokeWidth={1.9} />
            Sign out
          </button>
        </form>
      </aside>

        <div className="main-content" inert={drawerOpen} aria-hidden={drawerOpen || undefined}>{children}</div>
      </div>
    </AccountIdentityContext.Provider>
  );
}
