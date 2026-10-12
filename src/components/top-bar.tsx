"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ComponentType, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";
import { ChevronDown, LayoutTemplate, Link2, Megaphone, Plus, Search, Workflow, Zap } from "lucide-react";
import { WORKSPACE_ACTIONS, isPaletteShortcut } from "./command-palette-items";
import { presenceProps, usePresence } from "./ui/use-presence";

/** Every row a menu's keyboard pattern moves through. */
const MENU_ITEM_SELECTOR = '[role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"]';

/**
 * Spread on each row of a top-bar menu: a menu item reached with the arrow
 * keys rather than Tab (the whole menu is one tab stop).
 */
export const menuItemProps = { role: "menuitem", tabIndex: -1 } as const;

function menuItems(menu: HTMLElement | null): HTMLElement[] {
  return Array.from(menu?.querySelectorAll<HTMLElement>(MENU_ITEM_SELECTOR) ?? [])
    .filter((item) => !item.hasAttribute("disabled") && item.getAttribute("aria-disabled") !== "true");
}

/** The next item (after `from`, wrapping) whose label starts with `letter`. */
export function typeaheadIndex(labels: string[], from: number, letter: string): number {
  const wanted = letter.toLocaleLowerCase();
  for (let step = 1; step <= labels.length; step += 1) {
    const index = (from + step + labels.length) % labels.length;
    if (labels[index].trim().toLocaleLowerCase().startsWith(wanted)) return index;
  }
  return -1;
}

/**
 * The WAI-ARIA menu button pattern, shared by the + menu and the account
 * menus. On the button, Enter, Space or Arrow Down opens the menu on its first
 * item and Arrow Up opens it on its last. In the menu the arrow keys move
 * (wrapping), Home and End jump, a letter jumps to the next item starting with
 * it, Escape closes and hands focus back to the button, and Tab closes and
 * moves on. A click outside closes it too.
 */
export function useMenuButton() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** Which end the menu opens on (Arrow Up opens on the last item). */
  const openOn = useRef<"first" | "last">("first");
  const buttonId = useId();
  const presence = usePresence(open);

  useEffect(() => {
    if (!open) return;
    const items = menuItems(menuRef.current);
    (openOn.current === "last" ? items[items.length - 1] : items[0])?.focus();
    openOn.current = "first";
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

  const openAt = (end: "first" | "last") => {
    if (open) {
      const items = menuItems(menuRef.current);
      (end === "last" ? items[items.length - 1] : items[0])?.focus();
      return;
    }
    openOn.current = end;
    setOpen(true);
  };

  const onButtonKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    // Enter and Space arrive as a click, which opens on the first item.
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    openAt(event.key === "ArrowUp" ? "last" : "first");
  };

  const onMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = menuItems(menuRef.current);
    if (!items.length) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    const focusAt = (index: number) => {
      event.preventDefault();
      items[(index + items.length) % items.length]?.focus();
    };
    switch (event.key) {
      case "ArrowDown": return focusAt(current + 1);
      case "ArrowUp": return focusAt(current < 0 ? -1 : current - 1);
      case "Home": return focusAt(0);
      case "End": return focusAt(-1);
      case "Escape":
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      case "Tab":
        // Focus moves on as usual; the menu closes behind it.
        setOpen(false);
        return;
      case " ":
        // Buttons act on Space themselves; links only know Enter.
        if (current >= 0 && items[current].tagName === "A") {
          event.preventDefault();
          items[current].click();
        }
        return;
    }
    // Type-ahead: a letter jumps to the next item whose label starts with it.
    if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey || !event.key.trim()) return;
    const index = typeaheadIndex(items.map((item) => item.textContent ?? ""), current, event.key);
    if (index >= 0) focusAt(index);
  };

  return {
    open,
    rootRef,
    buttonRef,
    mounted: presence.mounted,
    state: presence.state,
    toggle: () => setOpen((value) => !value),
    close: () => setOpen(false),
    /** For the menu button: its id, popup type, state and the Arrow keys. */
    buttonProps: (menuId: string) => ({
      id: buttonId,
      "aria-haspopup": "menu" as const,
      "aria-expanded": open,
      "aria-controls": open ? menuId : undefined,
      onKeyDown: onButtonKeyDown,
    }),
    /** For the popup: the menu role, its name (the button) and the keys. */
    menuProps: (menuId: string) => ({
      id: menuId,
      ref: menuRef,
      role: "menu",
      "aria-labelledby": buttonId,
      onKeyDown: onMenuKeyDown,
      ...presenceProps(presence.state),
    }),
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
  const { mounted, toggle, close, rootRef, buttonRef, buttonProps, menuProps } = useMenuButton();
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
        {...buttonProps("create-menu")}
        onClick={toggle}
      >
        <ChevronDown size={16} strokeWidth={2.2} aria-hidden />
      </button>
      {mounted ? (
        <div className="topbar-menu topbar-create-menu" {...menuProps("create-menu")}>
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
              <button key={item.id} className="menu-item" type="button" {...menuItemProps} onClick={() => { close(); onTemplate(); }}>{copy}</button>
            ) : (
              <Link key={item.id} className="menu-item" href={item.href ?? "/"} {...menuItemProps} onClick={close}>{copy}</Link>
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
    // Context for the rows under it, not a row of its own.
    <div className="account-menu-head" role="none">
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
  const { mounted, toggle, close, rootRef, buttonRef, buttonProps, menuProps } = useMenuButton();
  return (
    <div className="topbar-account" ref={rootRef}>
      <button
        ref={buttonRef}
        className="topbar-account-button"
        type="button"
        aria-label={label}
        {...buttonProps(menuId)}
        onClick={toggle}
      >
        {avatar}
      </button>
      {mounted ? (
        <div className="topbar-menu topbar-account-menu" {...menuProps(menuId)}>
          {children(close)}
        </div>
      ) : null}
    </div>
  );
}
