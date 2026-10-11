/**
 * The command palette's data and matching, kept free of React so it can be
 * tested on its own. The palette component (command-palette.tsx) renders
 * whatever these produce; each shell hands it its own pages and actions.
 */

export type PaletteKind = "page" | "action" | "automation" | "contact" | "conversation" | "workspace" | "user";

export type PaletteItem = {
  /** Unique across the palette, e.g. "page:/dashboard". */
  id: string;
  /** The heading the item is listed under ("Pages", "Actions", "Automations"…). */
  section: string;
  kind: PaletteKind;
  label: string;
  /** One quiet line of context under or beside the label. */
  hint?: string;
  /** Extra words the item answers to ("billing" finds Settings → Billing). */
  keywords?: string;
  href?: string;
  /** A full page load (OAuth starts, file downloads) instead of a client navigation. */
  external?: boolean;
  /** A named action the shell handles itself (e.g. opening the template picker). */
  action?: string;
};

/** A section filled by an API call as the person types. */
export type PaletteSource = {
  section: string;
  /** Shortest query worth sending; shorter queries show nothing for this source. */
  minQuery: number;
  load: (query: string, signal: AbortSignal) => Promise<PaletteItem[]>;
};

const normalise = (value: string) => value.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").trim();

/**
 * How well `item` answers `query`: -1 for no match, otherwise lower is better.
 * Every word of the query has to appear in the label, hint or keywords; a
 * label that starts with the query beats one that merely contains it.
 */
export function matchScore(item: Pick<PaletteItem, "label" | "hint" | "keywords">, query: string): number {
  const needle = normalise(query);
  if (!needle) return 0;
  const label = normalise(item.label).replace(/^@/, "");
  const haystack = `${label} ${normalise(item.hint ?? "")} ${normalise(item.keywords ?? "")}`;
  const words = needle.split(/\s+/).filter(Boolean);
  if (!words.every((word) => haystack.includes(word))) return -1;
  if (label === needle) return 0;
  if (label.startsWith(needle)) return 1;
  if (label.split(/[\s/·-]+/).some((part) => part.startsWith(words[0]))) return 2;
  if (label.includes(needle)) return 3;
  return 4;
}

/** The items that answer `query`, best first, keeping the original order on ties. */
export function filterItems(items: readonly PaletteItem[], query: string, limit = Infinity): PaletteItem[] {
  return items
    .map((item, index) => ({ item, index, score: matchScore(item, query) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, limit)
    .map((entry) => entry.item);
}

export type PaletteGroup = { section: string; items: PaletteItem[] };

/** Groups items by section in first-seen order. */
export function groupBySection(items: readonly PaletteItem[]): PaletteGroup[] {
  const groups: PaletteGroup[] = [];
  for (const item of items) {
    const group = groups.find((entry) => entry.section === item.section);
    if (group) group.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

/** Next highlighted index for an arrow/Home/End key, wrapping at both ends. */
export function moveActive(current: number, count: number, key: string): number {
  if (count === 0) return -1;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "ArrowDown") return current < 0 ? 0 : (current + 1) % count;
  if (key === "ArrowUp") return current < 0 ? count - 1 : (current - 1 + count) % count;
  return current;
}

/** True while the person is typing somewhere, where "/" must stay a character. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const element = target as HTMLElement;
  if (element.isContentEditable) return true;
  const tag = element.tagName.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  if (tag !== "input") return false;
  const type = (element as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(type);
}

/** ⌘K / Ctrl K anywhere, or a bare "/" outside a text field, opens the palette. */
export function isPaletteShortcut(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey" | "target" | "isComposing">): boolean {
  if (event.isComposing) return false;
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "k") return true;
  return event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey && !isTypingTarget(event.target);
}

// ── Recent picks (per browser, per palette) ─────────────────────────────────

export const RECENT_LIMIT = 5;

type StoredItem = Pick<PaletteItem, "id" | "kind" | "label" | "hint" | "href" | "external" | "action">;

/** The last few things picked, newest first, listed under "Recent" before typing. */
export function readRecent(storageKey: string): PaletteItem[] {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is StoredItem => Boolean(entry) && typeof entry.id === "string" && typeof entry.label === "string" && (typeof entry.href === "string" || typeof entry.action === "string"))
      .slice(0, RECENT_LIMIT)
      .map((entry) => ({ ...entry, kind: entry.kind ?? "page", section: "Recent" }));
  } catch {
    return [];
  }
}

const toStored = (item: PaletteItem): StoredItem => ({ id: item.id, kind: item.kind, label: item.label, hint: item.hint, href: item.href, external: item.external, action: item.action });

export function rememberRecent(storageKey: string, item: PaletteItem): void {
  try {
    const next = [item, ...readRecent(storageKey).filter((entry) => entry.id !== item.id)]
      .slice(0, RECENT_LIMIT)
      .map(toStored);
    window.localStorage.setItem(storageKey, JSON.stringify(next));
  } catch {
    // Private mode or blocked storage: the palette still works, just without history.
  }
}

// ── Workspace palette ───────────────────────────────────────────────────────

export const WORKSPACE_RECENT_KEY = "linkar.palette.recent";
export const ADMIN_RECENT_KEY = "linkar.palette.recent.admin";

/** Actions the workspace palette and the top bar's + menu share. */
export const WORKSPACE_ACTIONS: PaletteItem[] = [
  { id: "action:new-automation", section: "Actions", kind: "action", label: "New automation", hint: "Start from a blank builder", keywords: "create add", href: "/automations/new" },
  { id: "action:quick-automation", section: "Actions", kind: "action", label: "Quick automation", hint: "Reply to comments on one post in a minute", keywords: "create add fast reel", href: "/quick-automation" },
  { id: "action:template", section: "Actions", kind: "action", label: "From a template", hint: "Pick a ready-made automation", keywords: "create add template gallery", action: "template" },
  { id: "action:tracked-link", section: "Actions", kind: "action", label: "New tracked link", hint: "Count the clicks on a link you share", keywords: "create add url short link", href: "/insights#tracked-links" },
  { id: "action:broadcast", section: "Actions", kind: "action", label: "New broadcast", hint: "Send one message to a group of contacts", keywords: "create add send message", href: "/automations/broadcasts#new-broadcast" },
];

const WORKSPACE_EXTRA_ACTIONS: PaletteItem[] = [
  { id: "action:connect-instagram", section: "Actions", kind: "action", label: "Connect Instagram", hint: "Add an Instagram professional account", keywords: "account link add", href: "/api/meta/oauth/start", external: true },
  { id: "action:connect-facebook", section: "Actions", kind: "action", label: "Connect a Facebook Page", hint: "Reply to comments on a Page", keywords: "account link add", href: "/api/facebook/oauth/start", external: true },
  { id: "action:export-contacts", section: "Actions", kind: "action", label: "Export contacts", hint: "Download every contact as a CSV file", keywords: "download csv", href: "/api/contacts/export", external: true },
];

export function workspacePages({ platformOwner = false }: { platformOwner?: boolean } = {}): PaletteItem[] {
  const page = (href: string, label: string, keywords = "", hint?: string): PaletteItem => ({ id: `page:${href}`, section: "Pages", kind: "page", label, href, keywords, ...(hint ? { hint } : {}) });
  return [
    page("/dashboard", "Home", "dashboard overview start"),
    page("/activity", "Inbox", "messages conversations dm replies"),
    page("/contacts", "Contacts", "people audience leads"),
    page("/automations", "Automations", "flows rules replies"),
    page("/automations/sequences", "Sequences", "follow up drip", "Automations"),
    page("/automations/broadcasts", "Broadcasts", "send campaign", "Automations"),
    page("/quick-automation", "Quick automation", "fast reel post"),
    page("/insights", "Insights", "analytics reports numbers stats"),
    page("/settings", "Settings", "preferences workspace"),
    page("/settings?section=connections", "Connections", "instagram facebook accounts channels", "Settings"),
    page("/settings?section=delivery", "Delivery", "messaging hours quiet", "Settings"),
    page("/settings?section=team", "Team", "members invite seats", "Settings"),
    page("/settings?section=billing", "Billing", "plan upgrade payment invoice", "Settings"),
    page("/settings?section=policies", "Policies", "privacy terms legal", "Settings"),
    page("/settings?section=security", "Security", "password sessions sign out data deletion", "Settings"),
    page("/profile", "My profile", "account security password two-factor"),
    page("/help", "Help", "support docs guide faq"),
    ...(platformOwner ? [page("/admin", "Owner console", "admin operator")] : []),
  ];
}

export function workspaceActions(): PaletteItem[] {
  return [...WORKSPACE_ACTIONS, ...WORKSPACE_EXTRA_ACTIONS];
}

// ── Owner console palette ───────────────────────────────────────────────────

export function adminPages(): PaletteItem[] {
  const page = (href: string, label: string, keywords = ""): PaletteItem => ({ id: `page:${href}`, section: "Pages", kind: "page", label, href, keywords });
  return [
    page("/admin", "Overview", "home dashboard totals"),
    page("/admin/workspaces", "Workspaces", "accounts customers tenants"),
    page("/admin/users", "Users", "people accounts invite"),
    page("/admin/plans", "Plans and invites", "billing invite codes premium"),
    page("/admin/operations", "Records", "automations messages contacts fix"),
    page("/admin/integrations", "Connected accounts", "instagram facebook tokens"),
    page("/admin/system", "Service health", "status incidents jobs queue worker"),
    page("/admin/deletions", "Delete data", "remove erase gdpr"),
    page("/admin/audit", "Audit log", "history events actions"),
    page("/admin/security", "Your security", "two-factor mfa authenticator"),
    page("/dashboard", "Back to workspace", "app home"),
  ];
}
