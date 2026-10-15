import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import type { FlowDefinition } from "@/src/lib/automation/types";

const mocks = vi.hoisted(() => ({ getValidatedSession: vi.fn() }));

vi.mock("@/src/lib/auth/session", () => ({ getValidatedSession: mocks.getValidatedSession }));

let repository = createMemoryRepository();
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => repository }));

const { GET, PATCH, DELETE } = await import("./route");

const definition: FlowDefinition = {
  version: 1,
  trigger: { type: "message", match: "keyword", keywords: ["price"] },
  conditions: [],
  actions: [{ type: "send_text", text: "Here you go" }],
};

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function patch(id: string, body: unknown) {
  return PATCH(new Request(`http://localhost/api/automations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }), context(id));
}

async function seedConnection(status: "CONNECTED" | "DISCONNECTED" = "CONNECTED") {
  await repository.upsertConnection({
    workspaceId: "workspace_1",
    igUserId: "ig_1",
    username: "creator",
    accessTokenEncrypted: "sealed",
    status,
  });
}

describe("PATCH /api/automations/[id] activation", () => {
  beforeEach(async () => {
    repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_1", "owner@linkar.in");
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", email: "owner@linkar.in", workspaceId: "workspace_1" });
  });

  it("switches on a pinned automation whose account is connected", async () => {
    await seedConnection();
    const automation = await repository.createAutomation("workspace_1", { name: "Flow", definition, instagramAccountId: "ig_1" });

    const response = await patch(automation.id, { status: "ACTIVE" });

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ status: "ACTIVE", activatedAt: expect.any(String) });
  });

  it("refuses a status-only activation when the pinned account was disconnected", async () => {
    await seedConnection("DISCONNECTED");
    const automation = await repository.createAutomation("workspace_1", { name: "Flow", definition, instagramAccountId: "ig_1" });

    const response = await patch(automation.id, { status: "ACTIVE" });

    expect(response.status).toBe(409);
    const body = await response.json() as { error: string; code: string };
    expect(body.code).toBe("activation_blocked");
    expect(body.error).toMatch(/no longer connected/);
    expect((await repository.getAutomation("workspace_1", automation.id))?.status).toBe("DRAFT");
  });

  it("refuses to switch on an unpinned automation", async () => {
    await seedConnection();
    const automation = await repository.createAutomation("workspace_1", { name: "Flow", definition });

    const response = await patch(automation.id, { status: "ACTIVE" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/Choose a connected Instagram account/);
  });

  it("refuses to switch on a stored definition that no longer validates", async () => {
    await seedConnection();
    const automation = await repository.createAutomation("workspace_1", {
      name: "Flow",
      instagramAccountId: "ig_1",
      definition: { ...definition, trigger: { type: "message", match: "keyword", keywords: [] } },
    });

    const response = await patch(automation.id, { status: "ACTIVE" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/setup is incomplete/);
  });

  it("still lets an automation be paused without activation checks", async () => {
    await seedConnection("DISCONNECTED");
    const automation = await repository.createAutomation("workspace_1", {
      name: "Flow", definition, instagramAccountId: "ig_1", status: "ACTIVE",
    });

    const response = await patch(automation.id, { status: "PAUSED" });

    expect(response.status).toBe(200);
  });
});

describe("a paused automation saved with a short link before short links were refused", () => {
  const withShortLink: FlowDefinition = {
    version: 1,
    trigger: { type: "message", match: "keyword", keywords: ["shop"] },
    conditions: [],
    actions: [{ type: "send_button", text: "Here you go", buttonLabel: "Shop now", url: "https://bit.ly/shop" }],
  };
  const fixed: FlowDefinition = {
    ...withShortLink,
    actions: [{ type: "send_button", text: "Here you go", buttonLabel: "Shop now", url: "https://shop.example.in/kurta" }],
  };

  beforeEach(async () => {
    repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_1", "owner@linkar.in");
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", email: "owner@linkar.in", workspaceId: "workspace_1" });
    await seedConnection();
  });

  it("can still be opened, renamed and fixed, but not switched on until the link is replaced", async () => {
    // Saved and switched on before the rule, then paused (a pause runs no checks).
    const automation = await repository.createAutomation("workspace_1", {
      name: "Shop", definition: withShortLink, instagramAccountId: "ig_1", status: "ACTIVE",
    });
    expect((await patch(automation.id, { status: "PAUSED" })).status).toBe(200);

    const shown = await GET(new Request(`http://localhost/api/automations/${automation.id}`), context(automation.id));
    expect(shown.status).toBe(200);
    expect((await shown.json()).data.definition).toEqual(withShortLink);

    expect((await patch(automation.id, { name: "Shop (old link)" })).status).toBe(200);

    const switchOn = await patch(automation.id, { status: "ACTIVE" });
    expect(switchOn.status).toBe(409);
    expect((await switchOn.json()).error).toMatch(/Short links from bit\.ly are not allowed\. Paste the full link instead/);

    const resaved = await patch(automation.id, { definition: withShortLink });
    expect(resaved.status).toBe(400);
    expect((await resaved.json()).error).toMatch(/^actions 1 url: Short links from bit\.ly are not allowed/);

    expect((await patch(automation.id, { definition: fixed })).status).toBe(200);
    const live = await patch(automation.id, { status: "ACTIVE" });
    expect(live.status).toBe(200);
    expect((await live.json()).data).toMatchObject({ name: "Shop (old link)", status: "ACTIVE", definition: fixed });
  });
});

describe("DELETE /api/automations/[id]", () => {
  beforeEach(async () => {
    repository = createMemoryRepository();
    await repository.ensureWorkspace("workspace_1", "owner@linkar.in");
    await repository.addMember("workspace_1", "member@linkar.in", "MEMBER", "user_2");
  });

  it("refuses a plain member", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_2", email: "member@linkar.in", workspaceId: "workspace_1" });
    const automation = await repository.createAutomation("workspace_1", { name: "Flow", definition });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context(automation.id));

    expect(response.status).toBe(403);
    expect(await repository.getAutomation("workspace_1", automation.id)).not.toBeNull();
  });

  it("lets the owner delete", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", email: "owner@linkar.in", workspaceId: "workspace_1" });
    const automation = await repository.createAutomation("workspace_1", { name: "Flow", definition });

    const response = await DELETE(new Request("http://localhost", { method: "DELETE" }), context(automation.id));

    expect(response.status).toBe(200);
  });
});
