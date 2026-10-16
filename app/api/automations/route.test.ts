import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";
import { createPrismaRepository, prisma } from "@/src/lib/prisma";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  createAutomation: vi.fn(),
  getAutomation: vi.fn(),
  listAutomations: vi.fn(),
  listConnections: vi.fn(),
  listFacebookPages: vi.fn(),
  assertEntitled: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => ({
    createAutomation: mocks.createAutomation,
    getAutomation: mocks.getAutomation,
    listAutomations: mocks.listAutomations,
    listConnections: mocks.listConnections,
    listFacebookPages: mocks.listFacebookPages,
  }),
}));
vi.mock("@/src/lib/entitlements/service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/lib/entitlements/service")>()),
  getEntitlementService: () => ({ assertEntitled: mocks.assertEntitled }),
}));

const { GET, POST } = await import("./route");

describe("POST /api/automations", () => {
  beforeEach(() => {
    mocks.getValidatedSession.mockReset().mockResolvedValue(null);
    mocks.createAutomation.mockReset();
    mocks.getAutomation.mockReset().mockResolvedValue(null);
    mocks.listAutomations.mockReset().mockResolvedValue([]);
    mocks.listConnections.mockReset().mockResolvedValue([]);
    mocks.listFacebookPages.mockReset().mockResolvedValue([]);
    mocks.assertEntitled.mockReset().mockResolvedValue(undefined);
  });

  it("rejects a new automation without an explicit provider and connection pin", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Comment reply",
        definition: { version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_channel_target" });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("rejects a provider and connection-pin mismatch", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "FACEBOOK",
        instagramAccountId: "ig_1",
        name: "Mismatched flow",
        definition: { version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "invalid_channel_target" });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("creates a Facebook automation with its verified Page target", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listFacebookPages.mockResolvedValue([{ pageId: "page_1", status: "CONNECTED" }]);
    mocks.createAutomation.mockImplementation(async (_workspaceId, input) => ({ id: "automation_1", ...input }));

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "FACEBOOK",
        facebookPageId: "page_1",
        name: "Page reply",
        definition: { version: 1, trigger: { type: "comment", match: "any", keywords: [], mediaIds: [] }, conditions: [], actions: [{ type: "private_reply", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createAutomation).toHaveBeenCalledWith("workspace_1", expect.objectContaining({
      provider: "FACEBOOK",
      facebookPageId: "page_1",
    }));
  });

  it("creates an active automation with its activation timestamp in one operation", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listConnections.mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED" }]);
    mocks.createAutomation.mockImplementation(async (_workspaceId, input) => ({ id: "automation_1", ...input }));

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "INSTAGRAM",
        instagramAccountId: "ig_1",
        name: "Active reply",
        status: "ACTIVE",
        definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(201);
    expect(mocks.createAutomation).toHaveBeenCalledWith("workspace_1", expect.objectContaining({
      status: "ACTIVE",
      activatedAt: expect.any(String),
    }));
  });

  it("rejects a Messenger definition on the Facebook Page-comment channel with field-addressable issues", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listFacebookPages.mockResolvedValue([{ pageId: "page_1", status: "CONNECTED" }]);

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "FACEBOOK",
        facebookPageId: "page_1",
        name: "Invalid Page flow",
        definition: {
          version: 1,
          trigger: { type: "message", match: "any", keywords: [] },
          conditions: [],
          actions: [{ type: "send_text", text: "Hello" }],
        },
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_channel_definition",
      issues: [
        { path: ["trigger", "type"], message: "Facebook Page comments do not support message triggers" },
        { path: ["actions", 0, "type"], message: "Facebook Page comments do not support send_text actions" },
      ],
    });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before creating an automation", async () => {
    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Comment reply", definition: {} }),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("rejects a revoked session before listing automations", async () => {
    const response = await GET(new Request("http://localhost/api/automations"));

    expect(response.status).toBe(401);
    expect(mocks.listAutomations).not.toHaveBeenCalled();
  });

  it("rejects automation names longer than 120 trimmed characters", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "INSTAGRAM",
        instagramAccountId: "ig_1",
        name: `  ${"a".repeat(121)}  `,
        definition: {
          version: 1,
          trigger: { type: "message", match: "any", keywords: [] },
          conditions: [],
          actions: [{ type: "send_text", text: "Hello" }],
        },
      }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.createAutomation).not.toHaveBeenCalled();
  });

  it("returns the literal automation-limit contract", async () => {
    const { EntitlementError } = await import("@/src/lib/entitlements/service");
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listConnections.mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED" }]);
    mocks.listAutomations.mockResolvedValue([{}, {}, {}]);
    mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "automations", 3, 3));

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "INSTAGRAM",
        instagramAccountId: "ig_1",
        name: "Comment reply",
        definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ error: "limit_reached", capability: "automations", used: 3, limit: 3 });
  });

  it("answers an invalid definition with a readable 400", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listConnections.mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED" }]);

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider: "INSTAGRAM", instagramAccountId: "ig_1", name: "Broken", definition: { version: 1 } }),
    }));

    expect(response.status).toBe(400);
    const body = await response.json() as { error: string };
    expect(body.error).not.toContain("\"code\"");
  });

  it("hides repository failures behind a generic 500 instead of echoing Prisma text", async () => {
    mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.listConnections.mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED" }]);
    mocks.createAutomation.mockRejectedValue(new Error("\nInvalid `prisma.automation.create()` invocation:\nUnique constraint failed"));
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(new Request("http://localhost/api/automations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "INSTAGRAM",
        instagramAccountId: "ig_1",
        name: "Comment reply",
        definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hello" }] },
      }),
    }));

    expect(response.status).toBe(500);
    const body = await response.json() as { error: string };
    expect(body.error).not.toContain("prisma");
    expect(errorLog).toHaveBeenCalled();
    errorLog.mockRestore();
  });

  describe("idempotency key", () => {
    const messageFlow = {
      provider: "INSTAGRAM",
      instagramAccountId: "ig_1",
      name: "Menu reply",
      definition: { version: 1, trigger: { type: "message", match: "any", keywords: [] }, conditions: [], actions: [{ type: "send_text", text: "Hello" }] },
    };
    const DERIVED_AUTOMATION_ID = /^automation_[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

    function createWithKey(idempotencyKey?: string, body: unknown = messageFlow) {
      return POST(new Request("http://localhost/api/automations", {
        method: "POST",
        headers: { "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
        body: JSON.stringify(body),
      }));
    }

    /** Automation rows live in a real memory repository, so a retry finds
     * what the first attempt stored. */
    function useStoredAutomations() {
      const memory = createMemoryRepository();
      mocks.createAutomation.mockImplementation(memory.createAutomation);
      mocks.getAutomation.mockImplementation(memory.getAutomation);
      return memory;
    }

    beforeEach(() => {
      mocks.getValidatedSession.mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
      mocks.listConnections.mockResolvedValue([{ igUserId: "ig_1", status: "CONNECTED" }]);
    });

    it("answers the same body and key twice with one automation", async () => {
      useStoredAutomations();

      const first = await createWithKey("create-key-1");
      const second = await createWithKey("create-key-1");

      expect(first.status).toBe(201);
      expect(second.status).toBe(200);
      const firstBody = await first.json() as { data: { id: string } };
      expect(firstBody.data.id).toMatch(DERIVED_AUTOMATION_ID);
      await expect(second.json()).resolves.toMatchObject({ replayed: true, data: { id: firstBody.data.id, name: "Menu reply" } });
      expect(mocks.createAutomation).toHaveBeenCalledTimes(1);
      // The replay comes before the plan count, which the first automation now fills.
      expect(mocks.assertEntitled).toHaveBeenCalledTimes(1);
    });

    it("replays for a workspace whose first attempt used up its automation limit", async () => {
      const { EntitlementError } = await import("@/src/lib/entitlements/service");
      useStoredAutomations();
      await createWithKey("create-key-2");
      mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "automations", 1, 1));

      const retry = await createWithKey("create-key-2");

      expect(retry.status).toBe(200);
      await expect(retry.json()).resolves.toMatchObject({ replayed: true });
    });

    it("replays instead of refusing when a same-key attempt alongside it filled the last slot", async () => {
      const { EntitlementError } = await import("@/src/lib/entitlements/service");
      useStoredAutomations();
      const winner = await createWithKey("create-key-4");
      expect(winner.status).toBe(201);
      const winnerId = (await winner.json() as { data: { id: string } }).data.id;

      // The other attempt's lookup ran before the winner stored its row, and
      // by its plan count the winner's row fills the limit.
      mocks.getAutomation.mockResolvedValueOnce(null);
      mocks.assertEntitled.mockRejectedValueOnce(new EntitlementError("limit_reached", "automations", 1, 1));
      const loser = await createWithKey("create-key-4");

      expect(loser.status).toBe(200);
      await expect(loser.json()).resolves.toMatchObject({ replayed: true, data: { id: winnerId } });
      expect(mocks.createAutomation).toHaveBeenCalledTimes(1);
    });

    it("still refuses at the limit when no same-key automation exists", async () => {
      const { EntitlementError } = await import("@/src/lib/entitlements/service");
      useStoredAutomations();
      mocks.assertEntitled.mockRejectedValue(new EntitlementError("limit_reached", "automations", 1, 1));

      const response = await createWithKey("create-key-5");

      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({ error: "limit_reached" });
      expect(mocks.getAutomation).toHaveBeenCalledTimes(2);
      expect(mocks.createAutomation).not.toHaveBeenCalled();
    });

    it("hands back the winner's automation when a same-key attempt loses the create race", async () => {
      const memory = useStoredAutomations();
      // Both attempts passed the lookup before either stored its row.
      mocks.getAutomation.mockResolvedValueOnce(null);
      mocks.createAutomation.mockImplementationOnce(async (workspaceId: string, input: Parameters<typeof memory.createAutomation>[1]) => {
        await memory.createAutomation(workspaceId, input);
        return memory.createAutomation(workspaceId, input);
      });

      const response = await createWithKey("create-key-3");

      expect(response.status).toBe(200);
      const body = await response.json() as { data: { id: string }; replayed?: boolean };
      expect(body.replayed).toBe(true);
      expect(body.data.id).toMatch(DERIVED_AUTOMATION_ID);
    });

    it.each([
      ["no header", undefined],
      ["a malformed header", "not a valid key!"],
    ])("keeps the old behaviour with %s: no lookup and a fresh id", async (_label, key) => {
      mocks.createAutomation.mockImplementation(async (_workspaceId, input) => ({ id: "automation_1", ...input }));

      const response = await createWithKey(key);

      expect(response.status).toBe(201);
      expect(mocks.getAutomation).not.toHaveBeenCalled();
      expect(mocks.createAutomation.mock.calls[0][1]).not.toHaveProperty("id");
    });
  });
});

describe("createAutomation with a caller-supplied id", () => {
  const input = {
    provider: "INSTAGRAM" as const,
    name: "Menu reply",
    instagramAccountId: "ig_1",
    definition: { version: 1 as const, trigger: { type: "message" as const, match: "any" as const, keywords: [] }, conditions: [], actions: [{ type: "send_text" as const, text: "Hello" }] },
  };

  it("memory: stores the given id and refuses a second create with it like a unique constraint", async () => {
    const memory = createMemoryRepository();

    const created = await memory.createAutomation("workspace_1", { ...input, id: "automation_fixed" });

    expect(created.id).toBe("automation_fixed");
    expect(await memory.getAutomation("workspace_1", "automation_fixed")).toEqual(created);
    await expect(memory.createAutomation("workspace_1", { ...input, id: "automation_fixed" })).rejects.toMatchObject({ code: "P2002" });
    expect((await memory.createAutomation("workspace_1", input)).id).toMatch(/^automation_/);
  });

  it("prisma: writes the given id, and a fresh one without it", async () => {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      ...data, createdAt: new Date(0), updatedAt: new Date(0),
    }));
    const repository = createPrismaRepository({ automation: { create } } as unknown as typeof prisma);

    await repository.createAutomation("workspace_1", { ...input, id: "automation_fixed" });
    await repository.createAutomation("workspace_1", input);

    expect(create.mock.calls[0][0].data.id).toBe("automation_fixed");
    expect(create.mock.calls[1][0].data.id).toMatch(/^automation_/);
    expect(create.mock.calls[1][0].data.id).not.toBe("automation_fixed");
  });
});
