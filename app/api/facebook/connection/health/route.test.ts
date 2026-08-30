import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getValidatedSession: vi.fn(),
  getServerEnv: vi.fn(),
  readSubscription: vi.fn(),
  unsealSecret: vi.fn(),
}));

vi.mock("@/src/lib/auth/session", () => ({
  getValidatedSession: mocks.getValidatedSession,
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/src/lib/facebook/oauth", () => ({
  readFacebookPageWebhookSubscription: mocks.readSubscription,
}));

vi.mock("@/src/lib/security/secrets", () => ({
  unsealSecret: mocks.unsealSecret,
}));

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { GET } = await import("./route");

describe("GET /api/facebook/connection/health", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getValidatedSession.mockReset().mockResolvedValue({ userId: "user_1", workspaceId: "workspace_1" });
    mocks.getServerEnv.mockReset().mockReturnValue({
      facebookApiVersion: "v25.0",
      facebookTokenEncryptionKey: "encryption-key",
      facebookAppId: "app_1",
    });
    mocks.unsealSecret.mockReset().mockReturnValue("page-token");
    mocks.readSubscription.mockReset();
  });

  it("reports feed missing when Meta returns a different one-field subscription", async () => {
    await repository.upsertFacebookPage({
      workspaceId: "workspace_1",
      pageId: "page_1",
      pageName: "Linkar Page",
      facebookUserId: "facebook_user_1",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });
    mocks.readSubscription.mockResolvedValue(["messages"]);

    const response = await GET(new Request("http://localhost/api/facebook/connection/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      subscribedFields: ["messages"],
      missingFields: ["feed"],
    });
  });
});
