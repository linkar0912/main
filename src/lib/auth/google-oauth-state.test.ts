import { describe, expect, it } from "vitest";
import { createGoogleOAuthState, readGoogleOAuthState } from "./google-oauth-state";

const SECRET = "a".repeat(32);

describe("createGoogleOAuthState / readGoogleOAuthState", () => {
  it("round-trips next, invite, and the nonce used to build the state", () => {
    const { state, nonce } = createGoogleOAuthState({ next: "/automations", invite: "tok-123" }, SECRET);
    const result = readGoogleOAuthState(state, SECRET);
    expect(result).toEqual({ next: "/automations", invite: "tok-123", nonce });
  });

  it("omits invite from the decoded payload when none was given", () => {
    const { state } = createGoogleOAuthState({ next: "/automations" }, SECRET);
    const result = readGoogleOAuthState(state, SECRET);
    expect(result?.invite).toBeUndefined();
  });

  it("rejects a state signed with a different secret", () => {
    const { state } = createGoogleOAuthState({ next: "/automations" }, SECRET);
    expect(readGoogleOAuthState(state, "b".repeat(32))).toBeNull();
  });

  it("rejects a tampered state payload", () => {
    const { state } = createGoogleOAuthState({ next: "/automations" }, SECRET);
    const [payload, signature] = state.split(".");
    const tampered = `${payload}x.${signature}`;
    expect(readGoogleOAuthState(tampered, SECRET)).toBeNull();
  });

  it("rejects an expired state", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { state } = createGoogleOAuthState({ next: "/automations" }, SECRET, now);
    const later = new Date(now.getTime() + 11 * 60 * 1_000);
    expect(readGoogleOAuthState(state, SECRET, later)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(readGoogleOAuthState("not-a-real-state", SECRET)).toBeNull();
  });
});
