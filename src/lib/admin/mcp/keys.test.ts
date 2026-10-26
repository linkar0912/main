import { createHash } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

const OWNER = "11111111-1111-4111-8111-111111111111";
const NOW = new Date("2026-10-25T12:00:00.000Z");
const owner = { userId: OWNER, email: "owner@linkar.in", sessionId: "session-1", aal: "aal2" as const };

const mocks = vi.hoisted(() => ({
  count: vi.fn(),
  create: vi.fn(),
  findUnique: vi.fn(),
  findMany: vi.fn(),
  update: vi.fn(),
  updateMany: vi.fn(),
  controlState: vi.fn(),
  ownerIds: [] as string[],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    adminMcpKey: {
      count: mocks.count,
      create: mocks.create,
      findUnique: mocks.findUnique,
      findMany: mocks.findMany,
      update: mocks.update,
      updateMany: mocks.updateMany,
    },
  },
}));
vi.mock("@/src/lib/env", () => ({ getServerEnv: () => ({ platformOwnerUserIds: mocks.ownerIds }) }));
vi.mock("@/src/lib/repository-provider", () => ({ getRepository: () => ({ getPlatformUserControlState: mocks.controlState }) }));

const {
  AdminMcpKeyError,
  MAX_ACTIVE_MCP_KEYS,
  authenticateAdminMcpKey,
  listAdminMcpKeys,
  mintAdminMcpKey,
  revokeAdminMcpKey,
} = await import("./keys");

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const VALID_TOKEN = `lkadm_${"A".repeat(43)}`;

function keyRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "mcpkey_1",
    ownerUserId: OWNER,
    ownerEmail: "owner@linkar.in",
    label: "Laptop",
    scope: "WRITE",
    tokenHash: sha256(VALID_TOKEN),
    tokenPrefix: "lkadm_AAAAAA",
    createdAt: new Date("2026-10-20T00:00:00.000Z"),
    expiresAt: new Date("2026-11-19T00:00:00.000Z"),
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("expected a rejection");
}

beforeEach(() => {
  for (const mock of [mocks.count, mocks.create, mocks.findUnique, mocks.findMany, mocks.update, mocks.updateMany, mocks.controlState]) mock.mockReset();
  mocks.ownerIds.splice(0, mocks.ownerIds.length, OWNER);
  mocks.count.mockResolvedValue(0);
  mocks.create.mockImplementation(async ({ data }) => ({ ...keyRow(), ...data, createdAt: NOW, lastUsedAt: null, revokedAt: null }));
  mocks.findUnique.mockResolvedValue(keyRow());
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.controlState.mockResolvedValue({ status: "ACTIVE", sessionInvalidBefore: null });
});

describe("mintAdminMcpKey", () => {
  it("returns the key once and stores only its SHA-256 digest", async () => {
    const result = await mintAdminMcpKey({ owner, label: "Laptop", scope: "READ", ttlDays: 7 }, NOW);

    expect(result.token).toMatch(/^lkadm_[A-Za-z0-9_-]{43}$/);
    const data = mocks.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(sha256(result.token));
    expect(JSON.stringify(data)).not.toContain(result.token);
    expect(data).toMatchObject({ ownerUserId: OWNER, ownerEmail: "owner@linkar.in", label: "Laptop", scope: "READ", tokenPrefix: result.token.slice(0, 12) });
    expect(data.expiresAt).toEqual(new Date("2026-11-01T12:00:00.000Z"));
    expect(result.key).toMatchObject({ label: "Laptop", scope: "READ", status: "ACTIVE", expiresAt: "2026-11-01T12:00:00.000Z", lastUsedAt: null });
    expect(result.key).not.toHaveProperty("tokenHash");
  });

  it("refuses a key beyond the active limit", async () => {
    mocks.count.mockResolvedValue(MAX_ACTIVE_MCP_KEYS);

    const error = await rejection(mintAdminMcpKey({ owner, label: "Laptop", scope: "WRITE", ttlDays: 30 }, NOW));

    expect(error).toBeInstanceOf(AdminMcpKeyError);
    expect(error).toMatchObject({ status: 409, code: "mcp_key_limit" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
});

describe("authenticateAdminMcpKey", () => {
  it("rejects a malformed key without reading the database", async () => {
    await expect(authenticateAdminMcpKey("lkadm_short", NOW)).rejects.toMatchObject({ status: 401, code: "invalid_mcp_key" });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it.each([
    ["an unknown key", () => mocks.findUnique.mockResolvedValue(null)],
    ["a revoked key", () => mocks.findUnique.mockResolvedValue(keyRow({ revokedAt: new Date("2026-10-24T00:00:00.000Z") }))],
    ["an expired key", () => mocks.findUnique.mockResolvedValue(keyRow({ expiresAt: NOW }))],
    ["a key whose owner left the allowlist", () => mocks.ownerIds.splice(0, mocks.ownerIds.length)],
    ["a key whose owner is suspended", () => mocks.controlState.mockResolvedValue({ status: "SUSPENDED", sessionInvalidBefore: null })],
    ["a key created before the owner's sessions were revoked", () => mocks.controlState.mockResolvedValue({ status: "ACTIVE", sessionInvalidBefore: "2026-10-21T00:00:00.000Z" })],
  ])("rejects %s", async (_name, arrange) => {
    arrange();
    await expect(authenticateAdminMcpKey(VALID_TOKEN, NOW)).rejects.toMatchObject({ status: 401, code: "invalid_mcp_key" });
  });

  it("looks the key up by digest and returns an AAL2 owner bound to the key", async () => {
    const principal = await authenticateAdminMcpKey(VALID_TOKEN, NOW);

    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { tokenHash: sha256(VALID_TOKEN) } });
    expect(principal).toEqual({
      keyId: "mcpkey_1",
      label: "Laptop",
      scope: "WRITE",
      expiresAt: "2026-11-19T00:00:00.000Z",
      owner: { userId: OWNER, email: "owner@linkar.in", sessionId: "mcp_key:mcpkey_1", aal: "aal2" },
    });
  });

  it("records the last use at most once a minute", async () => {
    mocks.findUnique.mockResolvedValue(keyRow({ lastUsedAt: new Date(NOW.getTime() - 30_000) }));
    await authenticateAdminMcpKey(VALID_TOKEN, NOW);
    expect(mocks.updateMany).not.toHaveBeenCalled();

    mocks.findUnique.mockResolvedValue(keyRow({ lastUsedAt: new Date(NOW.getTime() - 61_000) }));
    await authenticateAdminMcpKey(VALID_TOKEN, NOW);
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "mcpkey_1", revokedAt: null }, data: { lastUsedAt: NOW } });
  });

  it("still authenticates when the last-use write fails", async () => {
    mocks.updateMany.mockRejectedValue(new Error("pool timeout"));
    await expect(authenticateAdminMcpKey(VALID_TOKEN, NOW)).resolves.toMatchObject({ keyId: "mcpkey_1" });
  });
});

describe("listAdminMcpKeys", () => {
  it("lists the owner's keys newest first with their status", async () => {
    mocks.findMany.mockResolvedValue([
      keyRow({ id: "mcpkey_3", revokedAt: new Date("2026-10-24T00:00:00.000Z") }),
      keyRow({ id: "mcpkey_2", expiresAt: new Date("2026-10-21T00:00:00.000Z") }),
      keyRow(),
    ]);

    const keys = await listAdminMcpKeys(OWNER, NOW);

    expect(mocks.findMany).toHaveBeenCalledWith({ where: { ownerUserId: OWNER }, orderBy: { createdAt: "desc" }, take: 50 });
    expect(keys.map((key) => [key.id, key.status])).toEqual([["mcpkey_3", "REVOKED"], ["mcpkey_2", "EXPIRED"], ["mcpkey_1", "ACTIVE"]]);
  });
});

describe("revokeAdminMcpKey", () => {
  it("revokes the owner's own key", async () => {
    mocks.findUnique.mockResolvedValue(keyRow());
    mocks.update.mockResolvedValue(keyRow({ revokedAt: NOW }));

    const key = await revokeAdminMcpKey({ id: "mcpkey_1", ownerUserId: OWNER }, NOW);

    expect(mocks.update).toHaveBeenCalledWith({ where: { id: "mcpkey_1" }, data: { revokedAt: NOW } });
    expect(key.status).toBe("REVOKED");
  });

  it("answers not found for another owner's key", async () => {
    mocks.findUnique.mockResolvedValue(keyRow({ ownerUserId: "22222222-2222-4222-8222-222222222222" }));
    await expect(revokeAdminMcpKey({ id: "mcpkey_1", ownerUserId: OWNER }, NOW)).rejects.toMatchObject({ status: 404, code: "mcp_key_not_found" });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("returns an already revoked key unchanged", async () => {
    mocks.findUnique.mockResolvedValue(keyRow({ revokedAt: new Date("2026-10-24T00:00:00.000Z") }));
    await expect(revokeAdminMcpKey({ id: "mcpkey_1", ownerUserId: OWNER }, NOW)).resolves.toMatchObject({ status: "REVOKED", revokedAt: "2026-10-24T00:00:00.000Z" });
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
