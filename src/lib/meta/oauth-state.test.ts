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

  it("rejects every non-canonical spelling of the final signature character", () => {
    // The 32-byte HMAC encodes to 43 base64url characters; the last one carries
    // four padding bits, so a family of final characters decodes to the identical
    // buffer. Comparing decoded bytes accepted all of them. Exhaustive rather than
    // random: the previous single-flip assertion only caught this ~4% of runs.
    const secret = "session-secret-with-at-least-32-characters";
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const state = createOAuthState("workspace_owner", secret, new Date("2026-08-20T10:00:00.000Z"));
    const at = new Date("2026-08-20T10:05:00.000Z");

    expect(readOAuthState(state, secret, at)).toEqual({ workspaceId: "workspace_owner" });

    const last = state.slice(-1);
    for (const character of alphabet) {
      if (character === last) continue;
      expect(
        readOAuthState(`${state.slice(0, -1)}${character}`, secret, at),
        `final character "${character}" must not verify`,
      ).toBeNull();
    }
  });
});
