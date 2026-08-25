import { describe, expect, it } from "vitest";
import { createMemoryRepository } from "./memory-repository";
import { LEAD_STATUS_SCORE_DELTA, type AutomationContactRecord } from "./repository";

async function seedContact(repository: ReturnType<typeof createMemoryRepository>) {
  await repository.ensureWorkspace("workspace_crm", "owner@team.com");
  const { record } = await repository.touchContact("workspace_crm", "ig_1", "ig_user_1", "2026-08-25T10:00:00.000Z");
  return record;
}

describe("lead CRM repository methods", () => {
  it("initializes a fresh contact with NEW lead status and zero score", async () => {
    const repository = createMemoryRepository();
    const contact = await seedContact(repository);
    expect(contact.leadStatus).toBe("NEW");
    expect(contact.score).toBe(0);
    expect(contact.assigneeUserId).toBeUndefined();
    expect(contact.notes).toBeUndefined();
    expect(contact.sourceAutomationId).toBeUndefined();
  });

  it("updates the lead status, trims notes, and sets the assignee", async () => {
    const repository = createMemoryRepository();
    const contact = await seedContact(repository);
    const updated = await repository.updateContactProfile("workspace_crm", contact.id, {
      leadStatus: "ENGAGED",
      notes: "  Spoke with Alex on Tuesday  ",
      assigneeUserId: "alex@team.com",
    });
    expect(updated).not.toBeNull();
    expect(updated!.leadStatus).toBe("ENGAGED");
    expect(updated!.notes).toBe("Spoke with Alex on Tuesday");
    expect(updated!.assigneeUserId).toBe("alex@team.com");
    expect(updated!.score).toBe(LEAD_STATUS_SCORE_DELTA.ENGAGED);
  });

  it("bumps the score on every status change, then back to zero on a downgrade", async () => {
    const repository = createMemoryRepository();
    const contact = await seedContact(repository);
    await repository.updateContactProfile("workspace_crm", contact.id, { leadStatus: "QUALIFIED" });
    const qualified = await repository.getContactById("workspace_crm", contact.id);
    expect(qualified!.score).toBe(LEAD_STATUS_SCORE_DELTA.QUALIFIED);
    await repository.updateContactProfile("workspace_crm", contact.id, { leadStatus: "NEW" });
    const back = await repository.getContactById("workspace_crm", contact.id);
    expect(back!.score).toBe(0);
    expect(back!.leadStatus).toBe("NEW");
  });

  it("truncates notes longer than 4 000 characters", async () => {
    const repository = createMemoryRepository();
    const contact = await seedContact(repository);
    const longNotes = "x".repeat(5_000);
    const updated = await repository.updateContactProfile("workspace_crm", contact.id, { notes: longNotes });
    expect(updated!.notes).toHaveLength(4_000);
  });

  it("clears the assignee and notes when null is passed", async () => {
    const repository = createMemoryRepository();
    const contact = await seedContact(repository);
    await repository.updateContactProfile("workspace_crm", contact.id, {
      assigneeUserId: "someone@team.com",
      notes: "Pickup next week",
    });
    const cleared = await repository.updateContactProfile("workspace_crm", contact.id, {
      assigneeUserId: null,
      notes: null,
    });
    expect(cleared!.assigneeUserId).toBeUndefined();
    expect(cleared!.notes).toBeUndefined();
  });

  it("returns null for unknown contact ids", async () => {
    const repository = createMemoryRepository();
    const result = await repository.updateContactProfile("workspace_crm", "missing_id", { notes: "hi" });
    expect(result).toBeNull();
  });

  it("isolates contacts across workspaces", async () => {
    const repository = createMemoryRepository();
    const contact = await seedContact(repository);
    const stolen = await repository.updateContactProfile("other_workspace", contact.id, { leadStatus: "CUSTOMER" });
    expect(stolen).toBeNull();
    const fresh = await repository.getContactById("workspace_crm", contact.id);
    expect(fresh!.leadStatus).toBe("NEW");
  });

  it("counts contacts per lead status for the dashboard", async () => {
    const repository = createMemoryRepository();
    await seedContact(repository);
    const c2 = await repository.touchContact("workspace_crm", "ig_1", "ig_user_2", "2026-08-25T10:00:00.000Z");
    const c3 = await repository.touchContact("workspace_crm", "ig_1", "ig_user_3", "2026-08-25T10:00:00.000Z");
    await repository.updateContactProfile("workspace_crm", c2.record.id, { leadStatus: "ENGAGED" });
    await repository.updateContactProfile("workspace_crm", c3.record.id, { leadStatus: "CUSTOMER" });
    const counts = await repository.countContactsByLeadStatus("workspace_crm");
    expect(counts).toEqual({ NEW: 1, ENGAGED: 1, QUALIFIED: 0, CUSTOMER: 1 });
  });

  it("filters by lead status when listing contacts", async () => {
    const repository = createMemoryRepository();
    await seedContact(repository);
    const c2 = await repository.touchContact("workspace_crm", "ig_1", "ig_user_2", "2026-08-25T10:00:00.000Z");
    await repository.updateContactProfile("workspace_crm", c2.record.id, { leadStatus: "QUALIFIED" });
    const all: AutomationContactRecord[] = await repository.listContactsByLeadStatus("workspace_crm", { limit: 10 });
    expect(all).toHaveLength(2);
    const qualified: AutomationContactRecord[] = await repository.listContactsByLeadStatus("workspace_crm", { leadStatus: "QUALIFIED", limit: 10 });
    expect(qualified).toHaveLength(1);
    expect(qualified[0].id).toBe(c2.record.id);
  });
});
