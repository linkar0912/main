import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted: unknown[] = [];

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/prisma", () => ({
  prisma: {
    adminAuditEvent: {
      create: async ({ data }: { data: unknown }) => {
        persisted.push(data);
        return data;
      },
    },
  },
}));

const { appendAdminAuditEvent, redactAdminAuditValue } = await import("./audit");

describe("redactAdminAuditValue", () => {
  it("redacts secret-bearing keys recursively without removing safe context", () => {
    expect(
      redactAdminAuditValue({
        email: "member@linkar.in",
        accessTokenEncrypted: "ciphertext",
        nested: { password: "password", status: "ACTIVE" },
      }),
    ).toEqual({
      email: "member@linkar.in",
      accessTokenEncrypted: "[REDACTED]",
      nested: { password: "[REDACTED]", status: "ACTIVE" },
    });
  });

  it("bounds strings, arrays, and object depth", () => {
    const result = redactAdminAuditValue({
      long: "x".repeat(20_000),
      many: Array.from({ length: 120 }, (_, index) => index),
      deep: { a: { b: { c: { d: { e: { f: { g: "hidden" } } } } } } },
    }) as Record<string, unknown>;

    expect((result.long as string).length).toBe(4_000);
    expect(result.many).toHaveLength(100);
    expect(JSON.stringify(result.deep)).not.toContain("hidden");
  });
});

describe("appendAdminAuditEvent", () => {
  beforeEach(() => {
    persisted.length = 0;
  });

  it("persists a redacted append-only event with a generated Linkar id", async () => {
    await appendAdminAuditEvent({
      requestId: "request-1",
      phase: "SUCCESS",
      actorUserId: "11111111-1111-4111-8111-111111111111",
      actorEmail: "owner@linkar.in",
      sessionId: "session-1",
      action: "workspace.suspend",
      targetType: "workspace",
      targetId: "workspace-1",
      workspaceId: "workspace-1",
      reason: "abuse review",
      origin: "https://app.linkar.in",
      before: { status: "ACTIVE", token: "must-not-persist" },
      after: { status: "SUSPENDED" },
      ipHash: "sha256:request-ip",
      userAgent: "Linkar test agent",
    });

    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^audit_/),
        requestId: "request-1",
        phase: "SUCCESS",
        origin: "https://app.linkar.in",
        before: { status: "ACTIVE", token: "[REDACTED]" },
        after: { status: "SUSPENDED" },
      }),
    );
  });
});
