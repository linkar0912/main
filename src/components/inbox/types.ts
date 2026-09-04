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
};
export type InboxMessage = { id: string; direction: "inbound" | "outbound"; text: string; at: string; status: "received" | "sending" | "sent" | "failed" | "unknown"; error?: string };
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
