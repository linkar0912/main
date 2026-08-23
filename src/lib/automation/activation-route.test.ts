import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import type { AutomationRepository } from "@/src/lib/repository";

let repository: AutomationRepository;
const sessionState = vi.hoisted(() => ({
  validated: { userId: "user_owner", workspaceId: "workspace_a" } as { userId: string; workspaceId: string } | null,
}));

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: () => ({ email: "owner@example.com", workspaceId: "workspace_a" }),
  getValidatedSession: () => Promise.resolve(sessionState.validated),
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { DELETE, PATCH } = await import("@/app/api/automations/[id]/route");

const campaignDefinition = {
  version: 2 as const,
  trigger: {
    type: "comment" as const,
    source: "next_media" as const,
    mediaIds: [],
    mediaSnapshots: [],
    match: "keyword" as const,
    keywords: ["guide"],
  },
  publicReplies: [],
  openingMessage: { text: "Thanks for your comment", optInButtonLabel: "Get the guide" },
  followGate: { required: true as const, notFollowingMessage: "Follow us first", recheckButtonLabel: "I've followed" },
  delivery: { text: "Here is your guide", url: "https://example.com/guide" },
};

async function activate(automationId: string) {
  return PATCH(
    new Request("http://localhost/api/automations/" + automationId, {
      method: "PATCH",
      body: JSON.stringify({ status: "ACTIVE" }),
    }),
    { params: Promise.resolve({ id: automationId }) },
  );
}

async function patchDefinition(automationId: string, definition: unknown, status?: string) {
  return PATCH(
    new Request("http://localhost/api/automations/" + automationId, {
      method: "PATCH",
      body: JSON.stringify({ definition, ...(status ? { status } : {}) }),
    }),
    { params: Promise.resolve({ id: automationId }) },
  );
}

describe("PATCH /api/automations/[id] activation", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    sessionState.validated = { userId: "user_owner", workspaceId: "workspace_a" };
  });

  it("rejects a revoked session before updating an automation", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Protected", definition: campaignDefinition });
    sessionState.validated = null;

    const response = await activate(automation.id);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    await expect(repository.getAutomation("workspace_a", automation.id)).resolves.toMatchObject({ status: "DRAFT" });
  });

  it("returns a structured 400 response for malformed JSON", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Protected", definition: campaignDefinition });

    const response = await PATCH(
      new Request(`http://localhost/api/automations/${automation.id}`, { method: "PATCH", body: "{" }),
      { params: Promise.resolve({ id: automation.id }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Request body must be valid JSON" });
  });

  it("rejects an updated name longer than 120 trimmed characters", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Protected", definition: campaignDefinition });

    const response = await PATCH(
      new Request(`http://localhost/api/automations/${automation.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: `  ${"a".repeat(121)}  ` }),
      }),
      { params: Promise.resolve({ id: automation.id }) },
    );

    expect(response.status).toBe(400);
    await expect(repository.getAutomation("workspace_a", automation.id)).resolves.toMatchObject({ name: "Protected" });
  });

  it("timestamps and unbinds a non-active next-media automation when it becomes active", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Next Reel", definition: campaignDefinition });
    await repository.updateAutomation("workspace_a", automation.id, {
      activatedAt: "2026-08-21T09:00:00.000Z",
      boundMediaId: "media_stale",
    });

    const response = await activate(automation.id);
    const body = await response.json() as { data: { status: string; activatedAt?: string; boundMediaId?: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.activatedAt).not.toBe("2026-08-21T09:00:00.000Z");
    expect(body.data.boundMediaId).toBeUndefined();
  });

  it("preserves the activation timestamp and bound media on repeated active PATCH", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Next Reel", definition: campaignDefinition });
    await repository.updateAutomation("workspace_a", automation.id, {
      status: "ACTIVE",
      activatedAt: "2026-08-21T10:00:00.000Z",
      boundMediaId: "media_won",
    });

    const response = await activate(automation.id);
    const body = await response.json() as { data: { status: string; activatedAt?: string; boundMediaId?: string } };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      status: "ACTIVE",
      activatedAt: "2026-08-21T10:00:00.000Z",
      boundMediaId: "media_won",
    });
  });

  it("re-arms next_media binding when editing the definition of an already-ACTIVE campaign", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Next Reel", definition: campaignDefinition });
    await repository.updateAutomation("workspace_a", automation.id, {
      status: "ACTIVE",
      activatedAt: "2026-08-21T09:00:00.000Z",
      boundMediaId: "media_stale",
    });

    const editedDefinition = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, keywords: ["guide", "help"] },
    };
    const response = await patchDefinition(automation.id, editedDefinition);
    const body = await response.json() as { data: { status: string; activatedAt?: string; boundMediaId?: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.boundMediaId).toBeUndefined();
    expect(body.data.activatedAt).not.toBe("2026-08-21T09:00:00.000Z");
  });

  it("re-arms next_media binding when switching an ACTIVE campaign's trigger source back to next_media", async () => {
    const specificMediaDefinition = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, source: "specific_media" as const, mediaIds: ["media_old"] },
    };
    const automation = await repository.createAutomation("workspace_a", {
      name: "Next Reel",
      definition: specificMediaDefinition,
    });
    await repository.updateAutomation("workspace_a", automation.id, {
      status: "ACTIVE",
      activatedAt: "2026-08-21T09:00:00.000Z",
      boundMediaId: "media_stale_from_before",
    });

    const response = await patchDefinition(automation.id, campaignDefinition);
    const body = await response.json() as { data: { status: string; activatedAt?: string; boundMediaId?: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("ACTIVE");
    expect(body.data.boundMediaId).toBeUndefined();
    expect(body.data.activatedAt).not.toBe("2026-08-21T09:00:00.000Z");
  });

  it("does not re-arm binding when editing a PAUSED campaign's next_media definition (not yet active)", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Next Reel", definition: campaignDefinition });
    await repository.updateAutomation("workspace_a", automation.id, {
      status: "PAUSED",
      activatedAt: "2026-08-21T09:00:00.000Z",
      boundMediaId: "media_won",
    });

    const editedDefinition = {
      ...campaignDefinition,
      trigger: { ...campaignDefinition.trigger, keywords: ["guide", "help"] },
    };
    const response = await patchDefinition(automation.id, editedDefinition);
    const body = await response.json() as { data: { status: string; activatedAt?: string; boundMediaId?: string } };

    expect(response.status).toBe(200);
    expect(body.data.status).toBe("PAUSED");
    expect(body.data.activatedAt).toBe("2026-08-21T09:00:00.000Z");
    expect(body.data.boundMediaId).toBe("media_won");
  });
});

describe("DELETE /api/automations/[id]", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    sessionState.validated = { userId: "user_owner", workspaceId: "workspace_a" };
  });

  it("rejects a revoked session before deleting an automation", async () => {
    const automation = await repository.createAutomation("workspace_a", { name: "Protected", definition: campaignDefinition });
    sessionState.validated = null;

    const response = await DELETE(
      new Request(`http://localhost/api/automations/${automation.id}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: automation.id }) },
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    await expect(repository.getAutomation("workspace_a", automation.id)).resolves.toMatchObject({ id: automation.id });
  });
});
