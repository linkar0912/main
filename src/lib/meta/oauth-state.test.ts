import { describe, expect, it } from "vitest";
import { createOAuthState, readOAuthState } from "./oauth-state";

describe("Meta OAuth state", () => {
  it("round-trips the authorized workspace", () => {
    const state = createOAuthState(
      "workspace_owner",
      "session-secret-with-at-least-32-characters",
      new Date("2026-08-20T10:00:00.000Z"),
    );

    expect(
      readOAuthState(
        state,
        "session-secret-with-at-least-32-characters",
        new Date("2026-08-20T10:05:00.000Z"),
      ),
    ).toEqual({ workspaceId: "workspace_owner" });
  });

  it("rejects a modified or expired state", () => {
    const secret = "session-secret-with-at-least-32-characters";
    const state = createOAuthState("workspace_owner", secret, new Date("2026-08-20T10:00:00.000Z"));

    // The last character is base64url and may already be "x"; pick a replacement
    // that is guaranteed to differ so the tampering is deterministic.
    const tampered = `${state.slice(0, -1)}${state.endsWith("x") ? "y" : "x"}`;
    expect(readOAuthState(tampered, secret, new Date("2026-08-20T10:05:00.000Z"))).toBeNull();
    expect(readOAuthState(state, secret, new Date("2026-08-20T10:11:00.000Z"))).toBeNull();
  });
});
