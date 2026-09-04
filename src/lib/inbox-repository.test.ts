import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";

async function seedContact(
  repository: ReturnType<typeof createMemoryRepository>,
  id: string,
  seenAt: string,
  text: string,
) {
  const result = await repository.touchContact("workspace_1", "ig_1", id, seenAt);
  await repository.recordWebhookEvent("workspace_1", {
    providerEventId: `event_${id}`,
    eventType: "message.received",
    receivedAt: seenAt,
    payload: { accountId: "ig_1", recipientId: id, text },
  });
  return result.record;
}

describe("memory inbox repository", () => {
  it("paginates contacts with a stable cursor and no duplicates", async () => {
    const repository = createMemoryRepository();
    await seedContact(repository, "person_1", "2026-09-04T10:00:00.000Z", "one");
    await seedContact(repository, "person_2", "2026-09-04T10:00:00.000Z", "two");
    await seedContact(repository, "person_3", "2026-09-03T10:00:00.000Z", "three");

    const first = await repository.listInboxContacts("workspace_1", {
      limit: 2,
      sort: "newest",
      now: "2026-09-04T11:00:00.000Z",
    });
    const second = await repository.listInboxContacts("workspace_1", {
      limit: 2,
      sort: "newest",
      now: "2026-09-04T11:00:00.000Z",
      cursor: first.nextCursor,
    });

    expect(first.rows).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const people = [...first.rows, ...second.rows].map((row) => row.record.igScopedUserId);
    expect(new Set(people.slice(0, 2))).toEqual(new Set(["person_1", "person_2"]));
    expect(people[2]).toBe("person_3");
    expect(new Set(people).size).toBe(3);
    expect(second.nextCursor).toBeUndefined();
  });

  it("filters operational state before pagination", async () => {
    const repository = createMemoryRepository();
    const a = await seedContact(repository, "aanya", "2026-09-04T10:00:00.000Z", "Need the guide");
    const b = await seedContact(repository, "bharat", "2026-09-04T09:00:00.000Z", "Pricing please");
    await repository.setContactTags("workspace_1", "ig_1", "aanya", ["guide"]);
    await repository.updateInboxState("workspace_1", a.id, { action: "set_favorite", favorite: true });
    await repository.updateInboxState("workspace_1", a.id, { action: "set_assignment", assigneeUserId: "user_1" });
    await repository.updateInboxState("workspace_1", a.id, { action: "set_reminder", reminderAt: "2026-09-04T10:30:00.000Z" });
    await repository.updateInboxState("workspace_1", b.id, { action: "set_status", status: "CLOSED" });
    await repository.updateInboxState("workspace_1", b.id, { action: "mark_read", readAt: "2026-09-04T10:30:00.000Z" });

    const filtered = await repository.listInboxContacts("workspace_1", {
      limit: 10,
      sort: "unread",
      now: "2026-09-04T11:00:00.000Z",
      status: "OPEN",
      unread: true,
      assignment: "mine",
      currentUserId: "user_1",
      favorite: true,
      label: "guide",
      reminder: "due",
      query: "guide",
    });

    expect(filtered.rows).toHaveLength(1);
    expect(filtered.rows[0]).toMatchObject({
      preview: "Need the guide",
      unread: true,
      latestInboundAt: "2026-09-04T10:00:00.000Z",
      record: { id: a.id, inboxFavorite: true, inboxStatus: "OPEN" },
    });
  });

  it("isolates and paginates recipient events and generic activity", async () => {
    const repository = createMemoryRepository();
    await seedContact(repository, "person_1", "2026-09-04T10:00:00.000Z", "newer");
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "older",
      eventType: "message.received",
      receivedAt: "2026-09-04T09:00:00.000Z",
      payload: { accountId: "ig_1", recipientId: "person_1", text: "older" },
    });
    await seedContact(repository, "person_2", "2026-09-04T08:00:00.000Z", "other person");
    await repository.recordWebhookEvent("workspace_1", {
      providerEventId: "facebook_1",
      eventType: "facebook.comment.created",
      receivedAt: "2026-09-04T11:00:00.000Z",
      payload: { pageId: "page_1", senderId: "fb_1", text: "price" },
    });

    const events = await repository.listInboundEventsForRecipient(
      "workspace_1",
      "ig_1",
      "person_1",
      { limit: 1 },
    );
    expect(events.records).toHaveLength(1);
    expect(events.records[0].payload.text).toBe("newer");
    expect(events.nextCursor).toBeTruthy();

    const older = await repository.listInboundEventsForRecipient(
      "workspace_1",
      "ig_1",
      "person_1",
      { limit: 2, cursor: events.nextCursor },
    );
    expect(older.records.map((event) => event.payload.text)).toEqual(["older"]);

    const activity = await repository.listWebhookEventsPage("workspace_1", {
      limit: 10,
      eventType: "facebook.comment.created",
    });
    expect(activity.records.map((event) => event.providerEventId)).toEqual(["facebook_1"]);
  });
});
