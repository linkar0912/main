"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type ComponentType } from "react";
import {
  ArrowRight,
  Boxes,
  Clock3,
  CornerDownLeft,
  FileText,
  MessageCircle,
  Plus,
  Search,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import {
  filterItems,
  groupBySection,
  moveActive,
  readRecent,
  rememberRecent,
  type PaletteGroup,
  type PaletteItem,
  type PaletteKind,
  type PaletteSource,
} from "./command-palette-items";
import { useFocusTrap } from "./use-focus-trap";
import { presenceProps, usePresenceState } from "./ui/use-presence";

const KIND_ICONS: Record<PaletteKind, ComponentType<{ size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>> = {
  page: FileText,
  action: Plus,
  automation: Workflow,
  contact: UserRound,
  conversation: MessageCircle,
  workspace: Boxes,
  user: UserRound,
};

/** Wait this long after the last keystroke before asking an API. */
export const SEARCH_DEBOUNCE_MS = 180;

/** One live section's last answer, and the query it answered. */
type RemoteState = { status: "loading" | "ready" | "error"; items: PaletteItem[]; query: string };
type SectionStatus = RemoteState["status"];

export type CommandPaletteProps = {
  /** Accessible name of the dialog. */
  label: string;
  placeholder: string;
  pages: PaletteItem[];
  actions: PaletteItem[];
  sources: PaletteSource[];
  /** localStorage key for this palette's recent picks. */
  recentKey: string;
  onAction?: (action: string) => void;
  onClose: () => void;
};

/**
 * ⌘K palette: one search field over pages, actions and live results. Opened
 * by the top bar's search field, ⌘K / Ctrl K or "/". Arrow keys move, Enter
 * opens, Escape closes; on phones it is a full-screen sheet. Render it inside
 * <Presence> so it fades out instead of vanishing.
 */
export function CommandPalette({ label, placeholder, pages, actions, sources, recentKey, onAction, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const presence = usePresenceState();
  const baseId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [recent] = useState(() => readRecent(recentKey));
  const [remote, setRemote] = useState<Record<string, RemoteState>>({});

  // Released as soon as the exit starts, so focus is already back on the
  // opener (or inside the dialog an action opened) while the palette fades.
  useFocusTrap(panelRef, { active: presence === "open", onEscape: onClose, initialFocusRef: inputRef });

  const trimmed = query.trim();

  // Live sections: debounced, cancelled when the query moves on, and the
  // previous results stay up until the new ones land (no flash of nothing).
  useEffect(() => {
    const wanted = sources.filter((source) => trimmed.length >= source.minQuery);
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setRemote((current) => {
        const next: Record<string, RemoteState> = {};
        for (const source of wanted) next[source.section] = { status: "loading", items: current[source.section]?.items ?? [], query: trimmed };
        return next;
      });
      for (const source of wanted) {
        source.load(trimmed, controller.signal).then(
          (items) => {
            if (!controller.signal.aborted) setRemote((current) => ({ ...current, [source.section]: { status: "ready", items, query: trimmed } }));
          },
          () => {
            if (!controller.signal.aborted) setRemote((current) => ({ ...current, [source.section]: { status: "error", items: [], query: trimmed } }));
          },
        );
      }
    }, wanted.length ? SEARCH_DEBOUNCE_MS : 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed, sources]);

  // An answer for an older query (or none yet) means this section is still
  // searching, even inside the debounce window before the request starts.
  const sectionStatus = (section: string): SectionStatus | undefined => {
    const source = sources.find((entry) => entry.section === section);
    if (!source || trimmed.length < source.minQuery) return undefined;
    const state = remote[section];
    return !state || state.query !== trimmed ? "loading" : state.status;
  };

  const groups = useMemo<PaletteGroup[]>(() => {
    if (!trimmed) {
      return [
        ...(recent.length ? [{ section: "Recent", items: recent }] : []),
        { section: "Pages", items: pages },
        { section: "Actions", items: actions },
      ];
    }
    const local = groupBySection([...filterItems(pages, trimmed, 6), ...filterItems(actions, trimmed, 4)]);
    const live = sources
      .filter((source) => trimmed.length >= source.minQuery)
      .map((source) => ({ section: source.section, items: remote[source.section]?.items ?? [] }));
    return [...local, ...live];
  }, [trimmed, recent, pages, actions, sources, remote]);

  const options = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const activeIndex = options.length === 0 ? -1 : Math.min(Math.max(active, 0), options.length - 1);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  useEffect(() => {
    if (activeIndex < 0) return;
    document.getElementById(optionId(activeIndex))?.scrollIntoView?.({ block: "nearest" });
    // optionId is derived from the stable useId value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex]);

  function choose(item: PaletteItem) {
    rememberRecent(recentKey, item);
    onClose();
    if (item.action) {
      onAction?.(item.action);
    } else if (item.href && item.external) {
      window.location.assign(item.href);
    } else if (item.href) {
      router.push(item.href);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp" || ((event.key === "Home" || event.key === "End") && event.ctrlKey)) {
      event.preventDefault();
      setActive(moveActive(activeIndex, options.length, event.key));
    } else if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      const item = options[activeIndex];
      if (item) choose(item);
    }
  }

  const searching = sources.some((source) => sectionStatus(source.section) === "loading");
  const empty = Boolean(trimmed) && options.length === 0 && !searching;
  const listboxId = `${baseId}-listbox`;
  let index = -1;

  return (
    <div
      className="palette-scrim"
      {...presenceProps(presence)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div ref={panelRef} className="palette" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <div className="palette-search">
          <Search size={18} strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            className="palette-input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
            aria-label={placeholder}
            placeholder={placeholder}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="none"
            spellCheck={false}
            enterKeyHint="go"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
          />
          {searching ? <span className="palette-spinner" aria-hidden /> : null}
          <button className="palette-close" type="button" aria-label="Close search" onClick={onClose}>
            <X size={18} aria-hidden />
          </button>
        </div>

        <div ref={listRef} className="palette-results" id={listboxId} role="listbox" aria-label="Results">
          {groups.map((group) => {
            const headingId = `${baseId}-${group.section.replace(/\W+/g, "-").toLowerCase()}`;
            const status = sectionStatus(group.section);
            // Pages and actions only show when they match; live sections
            // always say what they are doing, unless nothing matched at all
            // (one "No results" message below covers that).
            if (group.items.length === 0 && (!status || (empty && status !== "error"))) return null;
            return (
              <div className="palette-group" role="group" aria-labelledby={headingId} key={group.section}>
                <div className="palette-group-label" id={headingId} role="presentation">
                  {group.section === "Recent" ? <Clock3 size={13} aria-hidden /> : null}
                  {group.section}
                  {status === "loading" && group.items.length > 0 ? <span className="palette-group-status">Searching…</span> : null}
                </div>
                {group.items.map((item) => {
                  index += 1;
                  const current = index;
                  const Icon = KIND_ICONS[item.kind] ?? ArrowRight;
                  return (
                    <div
                      key={item.id}
                      id={optionId(current)}
                      className="palette-option"
                      role="option"
                      aria-selected={current === activeIndex}
                      onMouseDown={(event) => event.preventDefault()}
                      onMouseMove={() => {
                        if (current !== activeIndex) setActive(current);
                      }}
                      onClick={() => choose(item)}
                    >
                      <span className="palette-option-icon" aria-hidden><Icon size={16} strokeWidth={1.9} aria-hidden /></span>
                      <span className="palette-option-copy">
                        <span className="palette-option-label">{item.label}</span>
                        {item.hint ? <span className="palette-option-hint">{item.hint}</span> : null}
                      </span>
                      <CornerDownLeft className="palette-option-enter" size={14} aria-hidden />
                    </div>
                  );
                })}
                {group.items.length === 0 && status === "loading" ? (
                  <p className="palette-note is-loading" role="presentation"><span className="palette-note-spinner" aria-hidden />Searching {group.section.toLowerCase()}…</p>
                ) : null}
                {group.items.length === 0 && status === "ready" ? <p className="palette-note" role="presentation">No matches</p> : null}
                {status === "error" ? <p className="palette-note" role="presentation">Could not search {group.section.toLowerCase()} right now.</p> : null}
              </div>
            );
          })}
          {empty ? (
            <div className="palette-empty" role="presentation">
              <strong>No results for “{trimmed}”</strong>
              <span>Try a page, an automation name or an Instagram handle.</span>
            </div>
          ) : null}
        </div>

        <div className="palette-foot" aria-hidden>
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd>esc</kbd> to close</span>
        </div>
      </div>
    </div>
  );
}
