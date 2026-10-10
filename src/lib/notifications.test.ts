import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ sendEmail: vi.fn(), listMembers: vi.fn(), warn: vi.fn() }));

vi.mock("./mailer", async () => {
  const actual = await vi.importActual<typeof import("./mailer")>("./mailer");
  return { ...actual, sendEmail: mocks.sendEmail };
});
vi.mock("./repository-provider", () => ({ getRepository: () => ({ listMembers: mocks.listMembers }) }));
vi.mock("./logger", () => ({ logger: { warn: mocks.warn, info: vi.fn(), debug: vi.fn(), error: vi.fn() } }));

const { notifyWorkspaceManagers, notificationRecentlySent, resetNotificationDedupeForTests } = await import("./notifications");

describe("notifyWorkspaceManagers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    resetNotificationDedupeForTests();
    mocks.listMembers.mockResolvedValue([{ role: "OWNER", email: "owner@example.com" }]);
  });

  it("treats an undelivered result as a failure, keeps the key retryable, and masks the address", async () => {
    mocks.sendEmail.mockResolvedValue({ delivered: false, reason: "provider_error", status: 503 });

    await notifyWorkspaceManagers("w1", "token-expired", "Reconnect Instagram", "body", 1_000);

    expect(notificationRecentlySent("token-expired", 1_001)).toBe(false);
    const context = mocks.warn.mock.calls[0][1];
    expect(context.error).toBe("provider_error");
    expect(context.to).not.toContain("owner@example.com");
  });

  it("remembers the key once a send is delivered", async () => {
    mocks.sendEmail.mockResolvedValue({ delivered: true, id: "email_1" });

    await notifyWorkspaceManagers("w1", "token-expired", "Reconnect Instagram", "body", 1_000);

    expect(notificationRecentlySent("token-expired", 1_001)).toBe(true);
    expect(mocks.warn).not.toHaveBeenCalled();
  });
});
