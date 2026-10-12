import type { InboxContact, InboxMessage } from "./types";

export type ConversationGroupKey = "waiting" | "open" | "closed";
export type ConversationGroup = { key: ConversationGroupKey; label: string; contacts: InboxContact[] };

const GROUPS: { key: ConversationGroupKey; label: string }[] = [
  { key: "waiting", label: "Waiting on you" },
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
];

/**
 * Who spoke last in a thread, ignoring sends that failed (a reply that never
 * left still leaves the person waiting). Undefined for an empty thread.
 */
export function lastSpeaker(messages: InboxMessage[]): InboxMessage["direction"] | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].status !== "failed") return messages[index].direction;
  }
  return undefined;
}

/**
 * Closed conversations are closed. An open one is waiting on you when it has
 * unread messages or the person spoke last. "Spoke last" is the open thread's
 * own messages when given (`speaker`, fresher than the list), otherwise the
 * list API's `lastMessageDirection`, which the server keeps for every
 * message in and every reply out, by hand or by an automation.
 */
export function conversationGroupOf(contact: InboxContact, speaker?: InboxMessage["direction"]): ConversationGroupKey {
  if (contact.inboxStatus === "CLOSED") return "closed";
  if (contact.unread || (speaker ?? contact.lastMessageDirection) === "inbound") return "waiting";
  return "open";
}

/** Splits the roster into Waiting on you · Open · Closed, keeping list order, dropping empty groups. */
export function groupConversations(
  contacts: InboxContact[],
  speakerOf: (contactId: string) => InboxMessage["direction"] | undefined = () => undefined,
): ConversationGroup[] {
  const buckets = new Map<ConversationGroupKey, InboxContact[]>(GROUPS.map((group) => [group.key, []]));
  for (const contact of contacts) buckets.get(conversationGroupOf(contact, speakerOf(contact.id)))!.push(contact);
  return GROUPS.flatMap((group) => {
    const members = buckets.get(group.key)!;
    return members.length ? [{ ...group, contacts: members }] : [];
  });
}
