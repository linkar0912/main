import type { PaletteItem, PaletteSource } from "./command-palette-items";
import { filterItems } from "./command-palette-items";

/**
 * Search sections backed by the APIs. Contacts, the inbox and the owner
 * console's workspaces and users are searched on the server as the person
 * types (debounced and cancelled by the palette). Automations are a short
 * list, so it is loaded once per palette session and matched here - by name
 * and by trigger keyword.
 */

const SECTION_LIMIT = 5;

async function readData<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`Search failed (${response.status})`);
  const payload = (await response.json()) as { data?: T };
  return payload.data as T;
}

/** One fetch per palette session for a list the palette filters itself. */
function sessionList<T>(load: (signal: AbortSignal) => Promise<T[]>): { get: (signal: AbortSignal) => Promise<T[]>; reset: () => void } {
  let pending: Promise<T[]> | null = null;
  return {
    get(signal) {
      // A fresh controller per session, so one aborted keystroke does not
      // poison the cached list for the rest.
      if (!pending) {
        const controller = new AbortController();
        pending = load(controller.signal).catch((error: unknown) => {
          pending = null;
          throw error;
        });
      }
      return new Promise<T[]>((resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        pending!.then(resolve, reject);
      });
    },
    reset() {
      pending = null;
    },
  };
}

type AutomationSummary = {
  id: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "PAUSED";
  provider?: "INSTAGRAM" | "FACEBOOK";
  /** Only the trigger keywords are read (both builder versions keep them here). */
  definition?: { trigger?: { keywords?: unknown } };
};
type ContactSummary = { id: string; instagramUsername?: string; email?: string; tags?: string[]; leadStatus?: string };
type ConversationSummary = { id: string; username?: string; preview?: string };

const STATUS_WORDS: Record<AutomationSummary["status"], string> = { ACTIVE: "Live", DRAFT: "Draft", PAUSED: "Paused" };
const STAGE_WORDS: Record<string, string> = { NEW: "New", ENGAGED: "Engaged", QUALIFIED: "Qualified", CUSTOMER: "Customer" };

/** The words that start an automation ("PRICE", "LINK"), as typed in the builder. */
export function triggerKeywords(automation: AutomationSummary): string[] {
  const keywords = automation.definition?.trigger?.keywords;
  return Array.isArray(keywords) ? keywords.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim() !== "") : [];
}

export function automationItem(automation: AutomationSummary): PaletteItem {
  const channel = automation.provider === "FACEBOOK" ? "Facebook" : "Instagram";
  const keywords = triggerKeywords(automation);
  const shown = keywords.slice(0, 2).map((keyword) => `“${keyword}”`).join(", ");
  const more = keywords.length > 2 ? ` +${keywords.length - 2}` : "";
  return {
    id: `automation:${automation.id}`,
    section: "Automations",
    kind: "automation",
    label: automation.name || "Untitled automation",
    hint: [STATUS_WORDS[automation.status] ?? "Draft", channel, shown ? `${shown}${more}` : ""].filter(Boolean).join(" · "),
    // Every keyword answers, not only the two in the hint.
    keywords: keywords.join(" "),
    href: `/automations/${encodeURIComponent(automation.id)}`,
  };
}

export function contactItem(contact: ContactSummary): PaletteItem | null {
  const name = contact.instagramUsername ? `@${contact.instagramUsername}` : contact.email;
  if (!name) return null;
  return {
    id: `contact:${contact.id}`,
    section: "Contacts",
    kind: "contact",
    label: name,
    hint: [contact.instagramUsername && contact.email ? contact.email : "", contact.leadStatus ? STAGE_WORDS[contact.leadStatus] ?? "" : ""].filter(Boolean).join(" · ") || undefined,
    keywords: (contact.tags ?? []).join(" "),
    // Opens that person's drawer on the Contacts page.
    href: `/contacts?contact=${encodeURIComponent(contact.id)}`,
  };
}

export function conversationItem(conversation: ConversationSummary): PaletteItem {
  return {
    id: `conversation:${conversation.id}`,
    section: "Conversations",
    kind: "conversation",
    label: conversation.username ? `@${conversation.username}` : "Instagram conversation",
    hint: conversation.preview ? conversation.preview.slice(0, 80) : undefined,
    href: `/activity?contact=${encodeURIComponent(conversation.id)}`,
  };
}

/** Contacts matching `query` anywhere in the workspace, searched on the server. */
export async function searchContacts(query: string, signal: AbortSignal): Promise<PaletteItem[]> {
  const params = new URLSearchParams({ scope: "all", q: query, limit: String(SECTION_LIMIT) });
  const data = await readData<{ contacts?: ContactSummary[] }>(await fetch(`/api/contacts?${params}`, { signal }));
  return (data?.contacts ?? []).flatMap((contact) => contactItem(contact) ?? []).slice(0, SECTION_LIMIT);
}

export function workspaceSources(): { sources: PaletteSource[]; reset: () => void } {
  const automations = sessionList<AutomationSummary>(async (signal) => readData<AutomationSummary[]>(await fetch("/api/automations", { signal })));
  return {
    reset() {
      automations.reset();
    },
    sources: [
      {
        section: "Automations",
        minQuery: 1,
        load: async (query, signal) => filterItems((await automations.get(signal)).map(automationItem), query, SECTION_LIMIT),
      },
      {
        section: "Contacts",
        minQuery: 2,
        load: searchContacts,
      },
      {
        section: "Conversations",
        minQuery: 2,
        load: async (query, signal) => {
          const params = new URLSearchParams({ query, limit: String(SECTION_LIMIT) });
          const data = await readData<{ contacts?: ConversationSummary[] }>(await fetch(`/api/inbox?${params}`, { signal }));
          return (data?.contacts ?? []).slice(0, SECTION_LIMIT).map(conversationItem);
        },
      },
    ],
  };
}

type AdminWorkspace = { id: string; name: string; slug: string; planName?: string };
type AdminUser = { id: string; email: string; workspaceCount?: number };

export function adminSources(): PaletteSource[] {
  return [
    {
      section: "Workspaces",
      minQuery: 2,
      load: async (query, signal) => {
        const params = new URLSearchParams({ search: query, limit: String(SECTION_LIMIT) });
        const page = await readData<{ items?: AdminWorkspace[] }>(await fetch(`/api/admin/workspaces?${params}`, { signal }));
        return (page?.items ?? []).slice(0, SECTION_LIMIT).map((workspace) => ({
          id: `workspace:${workspace.id}`,
          section: "Workspaces",
          kind: "workspace" as const,
          label: workspace.name,
          hint: [workspace.slug, workspace.planName].filter(Boolean).join(" · "),
          href: `/admin/workspaces/${encodeURIComponent(workspace.id)}`,
        }));
      },
    },
    {
      section: "Users",
      minQuery: 2,
      load: async (query, signal) => {
        const params = new URLSearchParams({ search: query, limit: String(SECTION_LIMIT) });
        const page = await readData<{ items?: AdminUser[] }>(await fetch(`/api/admin/users?${params}`, { signal }));
        return (page?.items ?? []).slice(0, SECTION_LIMIT).map((user) => ({
          id: `user:${user.id}`,
          section: "Users",
          kind: "user" as const,
          label: user.email,
          hint: typeof user.workspaceCount === "number" ? `${user.workspaceCount} ${user.workspaceCount === 1 ? "workspace" : "workspaces"}` : undefined,
          href: `/admin/users/${encodeURIComponent(user.id)}`,
        }));
      },
    },
  ];
}
