"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { presenceProps, usePresence } from "./ui/use-presence";

export type OverflowMenuItem = {
  key: string;
  label: string;
  icon: ReactNode;
  /** Accessible name when the visible label alone is ambiguous ("Delete Price list"). */
  ariaLabel?: string;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
  disabled?: boolean;
  /**
   * Two-step items (delete): the first pick turns the item into this
   * confirmation in place, focused; a second pick runs onSelect. Escape or
   * moving away backs out of it.
   */
  confirm?: { label: string; ariaLabel?: string };
};

/**
 * The "…" menu on automation rows and the automation detail header. Hover and
 * focus change ink and icon colour only - no grey fill (ROUND5 section A);
 * keyboard focus adds a 1px inset outline.
 */
export function AutomationOverflowMenu({ label, items, className = "" }: {
  /** Names the trigger for assistive tech: "More actions for Price list". */
  label: string;
  items: OverflowMenuItem[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [upward, setUpward] = useState(false);
  const presence = usePresence(open);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([aria-disabled=true])")?.focus();
    const close = (event: MouseEvent) => {
      if (!menu.current?.contains(event.target as Node) && !button.current?.contains(event.target as Node)) {
        setOpen(false);
        setConfirming(null);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (confirming) confirmRef.current?.focus();
  }, [confirming]);

  function toggle() {
    if (!open && button.current && typeof window !== "undefined") {
      // Open upwards when the rows below the trigger can't fit the menu.
      const rect = button.current.getBoundingClientRect();
      setUpward(rect.bottom + 48 * items.length + 24 > window.innerHeight && rect.top > 48 * items.length + 24);
    }
    setConfirming(null);
    setOpen((value) => !value);
  }

  function close(returnFocus: boolean) {
    setOpen(false);
    setConfirming(null);
    if (returnFocus) button.current?.focus();
  }

  function onMenuKey(event: KeyboardEvent<HTMLDivElement>) {
    const entries = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([aria-disabled=true])") ?? []);
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // First Escape backs out of a pending confirmation, the next one closes.
      if (confirming) setConfirming(null);
      else close(true);
    } else if (event.key === "Tab") {
      close(false);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      entries[(index + step + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      (event.key === "Home" ? entries[0] : entries.at(-1))?.focus();
    }
  }

  return (
    <div className={`auto-menu ${className}`.trim()}>
      <button
        ref={button}
        type="button"
        className="auto-menu-trigger"
        aria-label={label}
        title="More actions"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <MoreHorizontal size={18} aria-hidden />
      </button>
      {presence.mounted ? (
        <div
          ref={menu}
          id={menuId}
          className={`auto-menu-list${upward ? " is-up" : ""}`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
          {...presenceProps(presence.state)}
        >
          {items.map((item) => {
            const className = `auto-menu-item${item.danger ? " is-danger" : ""}`;
            if (item.href && !item.disabled) {
              return (
                <Link key={item.key} href={item.href} role="menuitem" className={className} aria-label={item.ariaLabel} onClick={() => close(false)}>
                  {item.icon}<span>{item.label}</span>
                </Link>
              );
            }
            if (item.confirm && confirming === item.key) {
              return (
                <button
                  key={item.key}
                  ref={confirmRef}
                  type="button"
                  role="menuitem"
                  className={`${className} is-confirming`}
                  aria-label={item.confirm.ariaLabel}
                  onClick={() => { close(false); item.onSelect?.(); }}
                  onBlur={() => setConfirming(null)}
                >
                  {item.icon}<span>{item.confirm.label}</span>
                </button>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={className}
                aria-label={item.ariaLabel}
                aria-disabled={item.disabled || undefined}
                onClick={() => {
                  if (item.disabled) return;
                  if (item.confirm) {
                    setConfirming(item.key);
                    return;
                  }
                  close(false);
                  item.onSelect?.();
                }}
              >
                {item.icon}<span>{item.label}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
