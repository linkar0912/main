export type InboxContact = {
  id: string;
  username?: string;
  avatarUrl: string;
  preview: string;
  lastMessageAt: string;
  canMessage: boolean;
  unread: boolean;
  leadStatus: "NEW" | "ENGAGED" | "QUALIFIED" | "CUSTOMER";
  tags: string[];
  inboxStatus: "OPEN" | "CLOSED";
  favorite: boolean;
  reminderAt?: string;
  assigneeUserId?: string;
  /** Automations are silent for this person until then (a teammate replied by hand). */
  automationsPausedUntil?: string;
};
export type InboxMessage = {
  id: string;
  direction: "inbound" | "outbound";
  text: string;
  at: string;
  status: "received" | "sending" | "sent" | "failed" | "unknown";
  error?: string;
  /** Photo, reel, voice note... the contact sent. `url` is Meta's CDN link and can expire. */
  attachment?: { type: string; label: string; url?: string };
  /** Client-only: idempotency key of an optimistic send, reused on retry. */
  clientKey?: string;
};
export type InboxMember = { userId: string; email: string; role: string };
export type InboxFiltersValue = {
  query: string;
  status: "all" | "open" | "closed";
  unread: boolean;
  assignment: "all" | "mine" | "unassigned";
  favorite: boolean;
  label: string;
  reminder: "all" | "due" | "scheduled";
  sort: "newest" | "oldest" | "unread";
};
