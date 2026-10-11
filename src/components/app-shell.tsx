"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  ChartNoAxesCombined,
  UserRound,
  CircleHelp,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  UsersRound,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { PRODUCT_NAME } from "@/src/lib/branding";
import { friendlyFirstName } from "@/src/lib/display-name";
import { LinkarMark } from "@/src/components/linkar-mark";
import { getWorkspaceBootstrap, refreshWorkspaceBootstrap, WORKSPACE_CHANGE_EVENT } from "@/src/lib/client/workspace-data";
import { CommandPalette } from "./command-palette";
import { WORKSPACE_RECENT_KEY, workspaceActions, workspacePages } from "./command-palette-items";
import { workspaceSources } from "./command-palette-sources";
import { SidebarAccountsSection } from "./sidebar-accounts";
import { AccountMenuButton, NewMenu, SearchTrigger, usePaletteHotkey } from "./top-bar";
import { Presence, usePresence } from "./ui/use-presence";
import { slidingThumbRef } from "./ui/use-sliding-thumb";
import { ThemeToggle } from "./theme-toggle";

const TemplatePickerModal = dynamic(() => import("./template-picker-modal").then((module) => module.TemplatePickerModal));

/** Workspace destinations in the sidebar, grouped by job. */
const workspaceNavigation = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/activity", label: "Inbox", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: UsersRound },
];

const automateNavigation = [
  { href: "/automations", label: "Automations", icon: Workflow },
  { href: "/quick-automation", label: "Quick automation", icon: Zap },
  { href: "/insights", label: "Insights", icon: ChartNoAxesCombined },
];

/** Personal destinations pinned to the bottom of the sidebar. */
const accountNavigation = [
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/help", label: "Help", icon: CircleHelp },
];

const SEARCH_PLACEHOLDER = "Search automations, contacts, messages…";

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  // /automations must not light up while /automations/sequences or /automations/broadcasts is open.
  if (href === "/automations") return pathname === "/automations" || pathname.startsWith("/automations/");
  return pathname === href || pathname.startsWith(`${href}/`);
}

export type AccountIdentity = { email: string; plan: string; role: "OWNER" | "ADMIN" | "MEMBER" };
type AccountIdentityState = Omit<AccountIdentity, "role"> & {
  role: AccountIdentity["role"] | "";
  /** Runtime SUPPORT_EMAIL from the shell bootstrap; "" until it resolves. */
  supportEmail: string;
  /** "" until the bootstrap resolves, so callers can tell "unknown" from "live". */
  mode: "demo" | "configured" | "";
};

const AccountIdentityContext = createContext<AccountIdentityState>({ email: "", plan: "free", role: "", supportEmail: "", mode: "" });

export function useAccountIdentity(): AccountIdentityState {
  return useContext(AccountIdentityContext);
}

function displayRole(role: AccountIdentity["role"] | ""): string {
  if (!role) return "Workspace";
  return role.charAt(0) + role.slice(1).toLowerCase();
}

/** "Tejastelkar" for tejastelkar9@..., "Your account" when no name survives. */
function displayNameFromEmail(email: string): string {
  return friendlyFirstName(email) ?? "Your account";
}

/** One letter from the friendly name; a person glyph stands in otherwise. */
function initialsOf(email: string): string {
  return friendlyFirstName(email)?.charAt(0).toUpperCase() ?? "";
}


/** app/dev-preview/workspace mirrors the real routes under a prefix; strip it so
 * the preview highlights the same nav item the real page would. */
const DEV_PREVIEW_PREFIX = "/dev-preview/workspace";

function routePathname(pathname: string): string {
  return pathname.startsWith(DEV_PREVIEW_PREFIX) ? pathname.slice(DEV_PREVIEW_PREFIX.length) || "/" : pathname;
}

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>) {
  const pathname = routePathname(usePathname());
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AccountIdentity["role"] | "">("");
  const [plan, setPlan] = useState("free");
  const [supportEmail, setSupportEmail] = useState("");
  const [mode, setMode] = useState<AccountIdentityState["mode"]>("");
  const [igAvatarUrl, setIgAvatarUrl] = useState("");
  const [platformOwner, setPlatformOwner] = useState(false);
  const [identityError, setIdentityError] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  // Leaves with a short exit beat instead of vanishing (ui/use-presence).
  const drawer = usePresence(drawerOpen);

  const palettePages = useMemo(() => workspacePages({ platformOwner }), [platformOwner]);
  const paletteActions = useMemo(() => workspaceActions(), []);
  const paletteSearch = useMemo(() => workspaceSources(), []);
  usePaletteHotkey(paletteOpen, setPaletteOpen);

  const closePalette = () => {
    setPaletteOpen(false);
    // The next session lists fresh automations and contacts.
    paletteSearch.reset();
  };

  const restoreMenuFocus = useRef(false);
  const closeDrawer = () => setDrawerOpen(false);
  // The top bar is inert while the drawer is open, so focus can only go back
  // to the menu button after the close has rendered (effect below).
  const closeDrawerAndRestoreFocus = () => {
    restoreMenuFocus.current = true;
    setDrawerOpen(false);
  };

  useEffect(() => {
    if (drawerOpen || !restoreMenuFocus.current) return;
    restoreMenuFocus.current = false;
    menuButtonRef.current?.focus();
  }, [drawerOpen]);

  // Instant, not smooth: html has scroll-behavior: smooth for in-page anchors,
  // and animating back to the top on every navigation made pages feel slow.
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  useEffect(() => {
    let mounted = true;
    getWorkspaceBootstrap()
      .then((data) => {
        if (!mounted) return;
        setEmail(data.email ?? "");
        setRole(data.role ?? "");
        setPlan(data.plan ?? "free");
        setSupportEmail(data.supportEmail ?? "");
        setMode(data.mode ?? "");
        setIgAvatarUrl(data.igAvatarUrl ?? "");
        setPlatformOwner(data.platformOwner ?? false);
        setIdentityError("");
      })
      .catch((caught: unknown) => {
        if (!mounted) return;
        // Surface a recoverable error so the top bar can say so instead of
        // silently rendering the empty default identity forever.
        setIdentityError(caught instanceof Error ? caught.message : "Could not load the workspace session");
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Refresh on focus + reconnect so role / plan / avatar updates from a
  // sibling tab or a flaky network are picked up without a full reload, and
  // right away when this tab changes billing or a channel connection
  // (notifyWorkspaceChanged in workspace-data.ts).
  useEffect(() => {
    let active = true;
    function onFocus() {
      void refreshWorkspaceBootstrap()
        .then((data) => {
          if (!active) return;
          setEmail(data.email ?? "");
          setRole(data.role ?? "");
          setPlan(data.plan ?? "free");
          setSupportEmail(data.supportEmail ?? "");
          setMode(data.mode ?? "");
          setIgAvatarUrl(data.igAvatarUrl ?? "");
          setPlatformOwner(data.platformOwner ?? false);
          setIdentityError("");
        })
        .catch(() => undefined);
    }
    window.addEventListener("focus", onFocus);
    window.addEventListener(WORKSPACE_CHANGE_EVENT, onFocus);
    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(WORKSPACE_CHANGE_EVENT, onFocus);
    };
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

  const avatar = igAvatarUrl ? (
    // eslint-disable-next-line @next/next/no-img-element -- Meta CDN avatar; next/image adds no value for one remote photo.
    <img className="avatar is-photo" src={igAvatarUrl} alt="Instagram profile picture" />
  ) : (
    <span className="avatar" aria-hidden>{initialsOf(email) || <UserRound size={16} strokeWidth={2} />}</span>
  );

  return (
    <AccountIdentityContext.Provider value={{ email, role, plan, supportEmail, mode }}>
      <a className="skip-link" href="#main-content">Skip to content</a>
      <div className="app-frame">
      {drawer.mounted && (
        // Pointer-only: keyboard and screen-reader users get the labelled close
        // button inside the drawer, so the scrim stays out of the tab order.
        <button className="scrim" type="button" aria-hidden tabIndex={-1} data-state={drawer.state} onClick={closeDrawerAndRestoreFocus} />
      )}

      <aside
        ref={sidebarRef}
        className="sidebar"
        data-open={String(drawerOpen)}
        data-state={drawer.mounted ? drawer.state : undefined}
        aria-label="Workspace sidebar"
        aria-modal={drawerOpen || undefined}
        role={drawerOpen ? "dialog" : undefined}
        tabIndex={-1}
      >
        <div className="sidebar-head">
          <Link className="sidebar-brand" href="/dashboard" onClick={closeDrawer}>
            <LinkarMark className="brand-mark" />
            <span className="brand-name">{PRODUCT_NAME}</span>
          </Link>
          {/* The drawer's own way out: the scrim and Escape are invisible on a phone. */}
          {drawerOpen ? (
            <button className="sidebar-close" type="button" aria-label="Close navigation" onClick={closeDrawerAndRestoreFocus}>
              <X size={20} aria-hidden />
            </button>
          ) : null}
        </div>

        <nav ref={slidingThumbRef} className="sidebar-nav" aria-label="Workspace sections">
          {[...workspaceNavigation, ...automateNavigation].map(({ href, label, icon: Icon }, index) => (
            <Fragment key={href}>
              {index === workspaceNavigation.length ? <span className="sidebar-label" aria-hidden>Automate</span> : null}
              <Link
                className={`sidebar-link ${isActive(pathname, href) ? "is-active" : ""}`}
                href={href}
                aria-current={isActive(pathname, href) ? "page" : undefined}
                onClick={closeDrawer}
              >
                <Icon size={17} strokeWidth={1.9} />
                {label}
              </Link>
            </Fragment>
          ))}
        </nav>

        <SidebarAccountsSection plan={plan} onNavigate={closeDrawer} />

        <span className="sidebar-spacer" />

        {platformOwner ? (
          <nav className="sidebar-nav" aria-label="Platform administration">
            <Link className="sidebar-link" href="/admin" onClick={closeDrawer}>
              <ShieldCheck size={17} strokeWidth={1.9} /> Admin
            </Link>
          </nav>
        ) : null}

        <nav ref={slidingThumbRef} className="sidebar-nav" aria-label="Account">
          {accountNavigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              className={`sidebar-link ${isActive(pathname, href) ? "is-active" : ""}`}
              href={href}
              aria-current={isActive(pathname, href) ? "page" : undefined}
              onClick={closeDrawer}
            >
              <Icon size={17} strokeWidth={1.9} />
              {label}
            </Link>
          ))}
        </nav>
      </aside>

        <div className="main-content" inert={drawerOpen} aria-hidden={drawerOpen || undefined}>
          <header className="app-topbar">
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
            <Link className="brand topbar-brand" href="/dashboard" aria-label={`${PRODUCT_NAME} overview`}>
              <LinkarMark className="brand-mark" />
              <span className="brand-name">{PRODUCT_NAME}</span>
            </Link>
            <SearchTrigger placeholder={SEARCH_PLACEHOLDER} onOpen={() => setPaletteOpen(true)} />
            <span className="topbar-spacer" />
            <NewMenu onTemplate={() => setTemplateOpen(true)} />
            {role === "" ? (
              identityError ? (
                <p className="topbar-account-error" role="alert" title={identityError}>Account unavailable</p>
              ) : (
                <span className="topbar-account-skeleton skeleton-block" aria-hidden />
              )
            ) : (
              <AccountMenuButton label="Account menu" menuId="account-menu" avatar={avatar} badge={<span className="plan-tag">{plan}</span>}>
                {(close) => (
                  <>
                    <div className="account-menu-head">
                      <strong title={email}>{displayNameFromEmail(email)}</strong>
                      <small>{email || `${PRODUCT_NAME} workspace`}</small>
                      <small className="account-menu-role"><span>{displayRole(role)}</span><span className="plan-tag">{plan}</span></small>
                    </div>
                    <Link
                      className="account-menu-item"
                      href="/profile"
                      aria-current={isActive(pathname, "/profile") ? "page" : undefined}
                      onClick={close}
                    >
                      <UserRound size={16} strokeWidth={1.9} /> My profile
                    </Link>
                    <ThemeToggle className="account-menu-item" showLabel />
                    <form action="/api/auth/logout" method="post">
                      <button className="account-menu-item is-danger" type="submit">
                        <LogOut size={16} strokeWidth={1.9} />
                        <span>Sign out</span>
                      </button>
                    </form>
                  </>
                )}
              </AccountMenuButton>
            )}
          </header>

          {/* The one landmark for page content; screens render plain wrappers
              inside it. tabIndex lets the skip link move focus here. */}
          <main id="main-content" className="app-content-slot" tabIndex={-1}>{children}</main>
        </div>
      </div>

      <Presence>
        {paletteOpen ? (
          <CommandPalette
            label="Search Linkar"
            placeholder={SEARCH_PLACEHOLDER}
            pages={palettePages}
            actions={paletteActions}
            sources={paletteSearch.sources}
            recentKey={WORKSPACE_RECENT_KEY}
            onAction={(action) => {
              if (action === "template") setTemplateOpen(true);
            }}
            onClose={closePalette}
          />
        ) : null}
      </Presence>
      <Presence>{templateOpen ? <TemplatePickerModal onClose={() => setTemplateOpen(false)} /> : null}</Presence>
    </AccountIdentityContext.Provider>
  );
}
