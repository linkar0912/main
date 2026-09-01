import { describe, expect, it } from "vitest";
import { buildSafeDiagnostics } from "./support-diagnostics";

describe("buildSafeDiagnostics", () => {
  it("projects connection health and failure identifiers without private fields", () => {
    const diagnostics = buildSafeDiagnostics({
      generatedAt: "2026-09-01T07:00:00.000Z",
      instagramHealth: [{
        id: "ig_connection_1",
        username: "creator",
        status: "CONNECTED",
        requiredFields: ["comments", "messages"],
        subscribedFields: ["comments"],
        missingFields: ["messages"],
        checkError: "raw provider secret error",
        accessToken: "instagram-secret-token",
        email: "owner@example.com",
      }],
      facebookHealth: [{
        id: "fb_connection_1",
        pageId: "page_1",
        pageName: "Linkar",
        status: "CONNECTED",
        requiredFields: ["feed"],
        subscribedFields: ["feed"],
        missingFields: [],
        secret: "facebook-secret",
      }],
      failures: [{
        id: "failure_1",
        kind: "BROADCAST_RECIPIENT",
        state: "FAILED",
        resultCode: "PROVIDER_REJECTED",
        attemptCount: 2,
        updatedAt: "2026-09-01T06:55:00.000Z",
        recipientId: "person_123",
        lastError: "private provider response",
        payload: { text: "private message" },
      }],
    });

    expect(diagnostics).toEqual({
      version: 1,
      generatedAt: "2026-09-01T07:00:00.000Z",
      instagram: [{ id: "ig_connection_1", status: "CONNECTED", subscribedFields: ["comments"], missingFields: ["messages"], check: "failed" }],
      facebook: [{ id: "fb_connection_1", status: "CONNECTED", subscribedFields: ["feed"], missingFields: [], check: "ok" }],
      recentFailures: [{ id: "failure_1", kind: "BROADCAST_RECIPIENT", resultCode: "PROVIDER_REJECTED", attemptCount: 2, updatedAt: "2026-09-01T06:55:00.000Z" }],
    });

    const serialized = JSON.stringify(diagnostics);
    for (const privateValue of ["instagram-secret-token", "owner@example.com", "facebook-secret", "person_123", "private provider response", "private message", "creator", "page_1"]) {
      expect(serialized).not.toContain(privateValue);
    }
  });
});
