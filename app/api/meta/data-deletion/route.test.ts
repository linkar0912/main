import { createHash, createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createMemoryRepository } from "@/src/lib/memory-repository";

const mocks = vi.hoisted(() => ({
  getServerEnv: vi.fn(),
}));

vi.mock("@/src/lib/env", () => ({
  getServerEnv: mocks.getServerEnv,
}));

const repository = createMemoryRepository();

vi.mock("@/src/lib/repository-provider", () => ({
  getRepository: () => repository,
}));

const { POST } = await import("./route");

const APP_SECRET = "app-secret";

function signedRequest(payload: Record<string, unknown>): string {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", APP_SECRET).update(encodedPayload).digest("base64url");
  return `${signature}.${encodedPayload}`;
}

function deletionRequest(signed: string): Request {
  const form = new URLSearchParams({ signed_request: signed });
  return new Request("http://localhost/api/meta/data-deletion", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
}

describe("POST /api/meta/data-deletion", () => {
  mocks.getServerEnv.mockReturnValue({ metaAppSecret: APP_SECRET, appUrl: "https://linkar.example" });

  it("continues with the winner's confirmation code instead of crashing when a concurrent request already committed", async () => {
    const payload = { algorithm: "HMAC-SHA256" as const, user_id: "ig_race", issued_at: Math.floor(Date.now() / 1000) };
    const signed = signedRequest(payload);
    const signedRequestHash = createHash("sha256").update(signed).digest("hex");

    // Seed the row the "winning" concurrent request already committed, under a
    // confirmation code this request never generated itself.
    await repository.beginInstagramDataDeletion("ig_race", "winner_code_123", signedRequestHash);

    // Simulate this request's own perception of the race: its initial existence
    // check still sees nothing (the other request hadn't committed yet from its
    // point of view), but its own insert then fails against the row that landed
    // first, forcing it into the recovery path.
    vi.spyOn(repository, "findDataDeletionByRequestHash").mockResolvedValueOnce(null);
    vi.spyOn(repository, "beginInstagramDataDeletion").mockRejectedValueOnce(new Error("unique constraint violation on signedRequestHash"));
    const completeSpy = vi.spyOn(repository, "completeDataDeletion");

    const response = await POST(deletionRequest(signed));

    expect(response.status).toBe(200);
    const body = await response.json() as { confirmation_code: string; url: string };
    expect(body.confirmation_code).toBe("winner_code_123");
    expect(body.url).toContain("winner_code_123");
    expect(completeSpy).toHaveBeenCalledWith("winner_code_123");
  });

  it("rethrows when the insert fails for a reason other than a losing race", async () => {
    const payload = { algorithm: "HMAC-SHA256" as const, user_id: "ig_real_error", issued_at: Math.floor(Date.now() / 1000) };
    const signed = signedRequest(payload);

    vi.spyOn(repository, "beginInstagramDataDeletion").mockRejectedValueOnce(new Error("database is unreachable"));
    // No matching row exists for this hash, so the recovery path must give up
    // and surface the original error rather than silently proceeding.
    await expect(POST(deletionRequest(signed))).rejects.toThrow("database is unreachable");
  });
});
