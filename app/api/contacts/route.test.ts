import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));
vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { GET } = await import("./route");

describe("GET /api/contacts", () => {
  beforeEach(async () => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    const first = await repository.touchContact("workspace_1", "ig_1", "person_1", "2026-09-01T06:00:00.000Z");
    await repository.captureContactEmail("workspace_1", "ig_1", "person_1", "one@example.com", "2026-09-01T06:01:00.000Z");
    await repository.touchContact("workspace_2", "ig_2", "foreign", "2026-09-01T06:02:00.000Z");
    await repository.updateContactProfile("workspace_1", first.record.id, { leadStatus: "QUALIFIED" });
  });

  it("preserves the legacy captured-email response by default", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/contacts"));
    const body = await response.json();

    expect(body.data.count).toBe(1);
    expect(body.data.contacts).toEqual([expect.objectContaining({ email: "one@example.com" })]);
    expect(body.data.counts).toBeUndefined();
  });

  it("lists full workspace contacts with lead-stage counts", async () => {
    const response = await GET(new Request("https://app.linkar.in/api/contacts?scope=all"));
    const body = await response.json();

    expect(body.data.count).toBe(1);
    expect(body.data.counts).toEqual({ NEW: 0, ENGAGED: 0, QUALIFIED: 1, CUSTOMER: 0 });
    expect(body.data.contacts).toEqual([
      expect.objectContaining({ email: "one@example.com", leadStatus: "QUALIFIED", igScopedUserId: "person_1" }),
    ]);
  });

  it("filters full contacts by a valid lead status and rejects an invalid one", async () => {
    const filtered = await GET(new Request("https://app.linkar.in/api/contacts?scope=all&leadStatus=NEW"));
    expect((await filtered.json()).data.contacts).toEqual([]);

    const invalid = await GET(new Request("https://app.linkar.in/api/contacts?scope=all&leadStatus=UNKNOWN"));
    expect(invalid.status).toBe(400);
  });
});
