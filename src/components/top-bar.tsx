"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { ChevronDown, LayoutTemplate, Link2, Megaphone, Plus, Search, Workflow, Zap } from "lucide-react";
import { WORKSPACE_ACTIONS, isPaletteShortcut } from "./command-palette-items";
import { presenceProps, usePresence } from "./ui/use-presence";

/**
 * A disclosure (not an ARIA menu): Tab moves through its links as usual, a
 * click outside closes it, and Escape closes it and hands focus back to the
 * toggle. Shared by the + menu and the account menus.
 */
export function useDisclosureMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const presence = usePresence(open);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return {
    open,
    rootRef,
    buttonRef,
    mounted: presence.mounted,
    state: presence.state,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
  };
}

/**
 * Opens the palette from ⌘K / Ctrl K anywhere and "/" outside text fields.
 * ⌘K closes it again; neither fires while another dialog holds the screen.
 */
export function usePaletteHotkey(open: boolean, setOpen: (open: boolean) => void) {
  const latest = useRef({ open, setOpen });
  useEffect(() => {
    latest.current = { open, setOpen };
  });
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPaletteShortcut(event)) return;
      const { open: isOpen, setOpen: update } = latest.current;
      if (isOpen) {
        if (event.key !== "/") {
          event.preventDefault();
          update(false);
        }
        return;
      }
      if (document.querySelector('[aria-modal="true"]')) return;
      event.preventDefault();
      update(true);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/** "⌘" on Apple keyboards, "Ctrl" elsewhere; empty until mounted (no hydration guess). */
function useShortcutModifier(): string {
  const [modifier, setModifier] = useState("");
  useEffect(() => {
    const platform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? navigator.platform ?? "";
    // Reading the platform needs the browser; one render with no hint is fine.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setModifier(/mac|iphone|ipad/i.test(platform) ? "⌘" : "Ctrl");
  }, []);
  return modifier;
}

/**
 * Looks like a search field, opens the command palette. Under 768px it
 * collapses to a 44px search icon button (same element, same name).
 */
export function SearchTrigger({ placeholder, onOpen }: { placeholder: string; onOpen: () => void }) {
  const modifier = useShortcutModifier();
  return (
    <button className="topbar-search" type="button" aria-haspopup="dialog" aria-label="Search" aria-keyshortcuts="Meta+K Control+K /" onClick={onOpen}>
      <Search size={17} strokeWidth={2} aria-hidden />
      <span className="topbar-search-placeholder" aria-hidden>{placeholder}</span>
      {modifier ? <kbd className="topbar-search-kbd" aria-hidden>{modifier} K</kbd> : null}
    </button>
  );
}

type MenuIcon = ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;

/** One icon per way to create, in the menu's icon column. */
const CREATE_ICONS: Record<string, MenuIcon> = {
  "action:new-automation": Workflow,
  "action:quick-automation": Zap,
  "action:template": LayoutTemplate,
  "action:tracked-link": Link2,
  "action:broadcast": Megaphone,
};

/** The workspace's create button: one click opens the template picker; the caret lists every way to start. */
export function NewMenu({ onTemplate }: { onTemplate: () => void }) {
  const { open, mounted, state, toggle, close, rootRef, buttonRef } = useDisclosureMenu();
  return (
    <div className="topbar-new" ref={rootRef}>
      <button className="button button-primary topbar-new-main" type="button" onClick={onTemplate}>
        <Plus size={16} strokeWidth={2.2} aria-hidden />
        <span className="topbar-new-label">New automation</span>
      </button>
      <button
        ref={buttonRef}
        className="button button-primary topbar-new-more"
        type="button"
        aria-label="More ways to create"
        aria-expanded={open}
        aria-controls={open ? "create-menu" : undefined}
        onClick={toggle}
      >
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden />
      </button>
      {mounted ? (
        <div className="topbar-menu topbar-create-menu" id="create-menu" {...presenceProps(state)}>
          {WORKSPACE_ACTIONS.map((item) => {
            const Icon = CREATE_ICONS[item.id] ?? Plus;
            // One line per row; the longer explanation stays in the tooltip
            // and in the ⌘K palette.
            const copy = (
              <>
                <Icon size={16} strokeWidth={1.9} aria-hidden />
                <span className="menu-item-label" title={item.hint}>{item.label}</span>
              </>
            );
            return item.action ? (
              <button key={item.id} className="menu-item" type="button" onClick={() => { close(); onTemplate(); }}>{copy}</button>
            ) : (
              <Link key={item.id} className="menu-item" href={item.href ?? "/"} onClick={close}>{copy}</Link>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The account menu's head: avatar, name and email on one aligned row, then
 * one quiet line (role and plan in plain words).
 */
export function AccountMenuHead({ avatar, name, email, meta }: { avatar: ReactNode; name: string; email: string; meta: string }) {
  return (
    <div className="account-menu-head">
      <div className="account-menu-who">
        {avatar}
        <span className="account-menu-id">
          <strong title={name}>{name}</strong>
          {email ? <small title={email}>{email}</small> : null}
        </span>
      </div>
      <p className="account-menu-meta">{meta}</p>
    </div>
  );
}

/** A hairline between groups of menu rows. */
export function MenuDivider() {
  return <div className="menu-divider" role="separator" />;
}

/**
 * The profile picture as the whole button (initials when there is none),
 * used by both shells' top bars. A ring marks hover and the open state.
 */
export function AccountMenuButton({
  label,
  avatar,
  menuId,
  children,
}: {
  label: string;
  avatar: ReactNode;
  menuId: string;
  children: (close: () => void) => ReactNode;
}) {
  const { open, mounted, state, toggle, close, rootRef, buttonRef } = useDisclosureMenu();
  return (
    <div className="topbar-account" ref={rootRef}>
      <button
        ref={buttonRef}
        className="topbar-account-button"
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
      >
        {avatar}
      </button>
      {mounted ? (
        <div className="topbar-menu topbar-account-menu" id={menuId} {...presenceProps(state)}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}
