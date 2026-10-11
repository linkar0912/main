import { describe, expect, it } from "vitest";
import { conversationGroupOf, groupConversations, lastSpeaker } from "./conversation-groups";
import type { InboxContact, InboxMessage } from "./types";

const base: InboxContact = {
  id: "c1", username: "aanya", avatarUrl: "", preview: "Hi", lastMessageAt: "2026-09-04T10:00:00.000Z",
  canMessage: true, unread: false, leadStatus: "NEW", tags: [], inboxStatus: "OPEN", favorite: false,
};
const message = (direction: InboxMessage["direction"], status: InboxMessage["status"] = direction === "inbound" ? "received" : "sent"): InboxMessage =>
  ({ id: `${direction}_${status}`, direction, text: "x", at: "2026-09-04T10:00:00.000Z", status });

describe("conversation groups", () => {
  it("puts unread and person-spoke-last conversations in Waiting on you", () => {
    expect(conversationGroupOf({ ...base, unread: true })).toBe("waiting");
    expect(conversationGroupOf(base, "inbound")).toBe("waiting");
    expect(conversationGroupOf(base, "outbound")).toBe("open");
    expect(conversationGroupOf(base)).toBe("open");
  });

  it("keeps closed conversations closed whatever was said last", () => {
    expect(conversationGroupOf({ ...base, inboxStatus: "CLOSED" }, "inbound")).toBe("closed");
  });

  it("orders groups Waiting on you, Open, Closed, keeps list order and drops empty groups", () => {
    const contacts = [
      { ...base, id: "a" },
      { ...base, id: "b", unread: true },
      { ...base, id: "c", inboxStatus: "CLOSED" as const },
      { ...base, id: "d" },
      { ...base, id: "e" },
    ];
    const groups = groupConversations(contacts, (id) => (id === "d" ? "inbound" : undefined));
    expect(groups.map((group) => [group.label, group.contacts.map((contact) => contact.id)])).toEqual([
      ["Waiting on you", ["b", "d"]],
      ["Open", ["a", "e"]],
      ["Closed", ["c"]],
    ]);
    expect(groupConversations([{ ...base, id: "x" }]).map((group) => group.key)).toEqual(["open"]);
    expect(groupConversations([])).toEqual([]);
  });

  it("reads the last speaker from a thread, skipping sends that failed", () => {
    expect(lastSpeaker([])).toBeUndefined();
    expect(lastSpeaker([message("inbound"), message("outbound")])).toBe("outbound");
    expect(lastSpeaker([message("inbound"), message("outbound", "failed")])).toBe("inbound");
    expect(lastSpeaker([message("inbound"), message("outbound", "sending")])).toBe("outbound");
  });
});
