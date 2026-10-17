import { describe, expect, it } from "vitest";
import { createGoogleOAuthState, OAUTH_STATE_TTL_MS, readGoogleOAuthState, readGoogleOAuthStateContext } from "./google-oauth-state";

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
    const later = new Date(now.getTime() + 31 * 60 * 1_000);
    expect(readGoogleOAuthState(state, SECRET, later)).toBeNull();
  });

  it("gives a sign-in 30 minutes, so a slow account chooser or 2-step check still finishes", () => {
    expect(OAUTH_STATE_TTL_MS).toBe(30 * 60 * 1_000);
    const now = new Date("2026-01-01T00:00:00Z");
    const { state } = createGoogleOAuthState({ next: "/automations" }, SECRET, now);
    expect(readGoogleOAuthState(state, SECRET, new Date(now.getTime() + 29 * 60 * 1_000))?.next).toBe("/automations");
  });

  it("rejects garbage input", () => {
    expect(readGoogleOAuthState("not-a-real-state", SECRET)).toBeNull();
  });
});

describe("readGoogleOAuthStateContext (error redirects only)", () => {
  it("reads next and invite from an expired but correctly signed state", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const { state } = createGoogleOAuthState({ next: "/automations", invite: "raw-token" }, SECRET, now);
    const muchLater = new Date(now.getTime() + 24 * 60 * 60 * 1_000);
    expect(readGoogleOAuthState(state, SECRET, muchLater)).toBeNull();
    expect(readGoogleOAuthStateContext(state, SECRET)).toEqual({ next: "/automations", invite: "raw-token" });
  });

  it("omits invite when none was signed", () => {
    const { state } = createGoogleOAuthState({ next: "/automations" }, SECRET);
    expect(readGoogleOAuthStateContext(state, SECRET)).toEqual({ next: "/automations" });
  });

  it("rejects a tampered state, another secret's state and garbage", () => {
    const { state } = createGoogleOAuthState({ next: "/automations", invite: "raw-token" }, SECRET);
    const [payload, signature] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), invite: "other" })).toString("base64url");
    expect(readGoogleOAuthStateContext(`${forged}.${signature}`, SECRET)).toBeNull();
    expect(readGoogleOAuthStateContext(`${payload}x.${signature}`, SECRET)).toBeNull();
    expect(readGoogleOAuthStateContext(state, "b".repeat(32))).toBeNull();
    expect(readGoogleOAuthStateContext("not-a-real-state", SECRET)).toBeNull();
  });
});
