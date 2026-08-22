import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getSessionFromRequest: vi.fn(),
  getServerEnv: vi.fn(),
  getSubscribedFields: vi.fn(),
  unsealSecret: vi.fn(),
}));

class MockMetaApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MetaApiError";
  }
}

vi.mock("@/src/lib/auth/session", () => ({
  getSessionFromRequest: mocks.getSessionFromRequest,
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

vi.mock("@/src/lib/meta/client", () => ({
  MetaClient: class {
    getSubscribedFields = mocks.getSubscribedFields;
  },
  MetaApiError: MockMetaApiError,
}));

vi.mock("@/src/lib/security/secrets", () => ({
  unsealSecret: mocks.unsealSecret,
}));

let repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { GET } = await import("./route");

function healthRequest(): Request {
  return new Request("http://localhost/api/meta/connection/health");
}

describe("GET /api/meta/connection/health", () => {
  beforeEach(() => {
    repository = createMemoryRepository();
    mocks.getSessionFromRequest.mockReset();
    mocks.getSessionFromRequest.mockReturnValue({ email: "owner@example.com", workspaceId: "workspace_1" });
    mocks.getServerEnv.mockReset();
    mocks.getServerEnv.mockReturnValue({ metaApiVersion: "v25.0", metaTokenEncryptionKey: "encryption-key", metaAppId: "app_1" });
    mocks.unsealSecret.mockReset();
    mocks.unsealSecret.mockReturnValue("plain-token");
    mocks.getSubscribedFields.mockReset();
  });

  it("returns 401 when the owner session is missing", async () => {
    mocks.getSessionFromRequest.mockReturnValue(null);

    const response = await GET(healthRequest());

    expect(response.status).toBe(401);
  });

  it("reports every required field missing when nothing is connected", async () => {
    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ data: [] });
  });

  it("reports which fields are missing for a connected account", async () => {
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });
    mocks.getSubscribedFields.mockResolvedValue(["comments", "messages"]);

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      username: "creator",
      status: "CONNECTED",
      subscribedFields: ["comments", "messages"],
      missingFields: [],
    });
    expect(mocks.unsealSecret).toHaveBeenCalledWith("sealed-token", "encryption-key");
  });

  it("reports no missing fields once the full set is subscribed", async () => {
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });
    mocks.getSubscribedFields.mockResolvedValue([
      "comments",
      "messages",
      "messaging_postbacks",
      "messaging_optins",
      "messaging_referral",
    ]);

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(body.data[0].missingFields).toEqual([]);
  });

  it("surfaces a check error without crashing when Meta rejects the lookup", async () => {
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "CONNECTED",
    });
    mocks.getSubscribedFields.mockRejectedValue(new MockMetaApiError("Meta request failed (500)"));

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).toMatchObject({
      subscribedFields: [],
      missingFields: ["comments", "messages"],
      checkError: "Meta request failed (500)",
    });
  });

  it("does not call Meta for a disconnected account and marks every field missing", async () => {
    await repository.upsertConnection({
      workspaceId: "workspace_1",
      igUserId: "ig_123",
      username: "creator",
      accessTokenEncrypted: "sealed-token",
      status: "DISCONNECTED",
    });

    const response = await GET(healthRequest());
    const body = await response.json();

    expect(mocks.getSubscribedFields).not.toHaveBeenCalled();
    expect(body.data[0]).toMatchObject({
      status: "DISCONNECTED",
      missingFields: ["comments", "messages"],
    });
  });
});
