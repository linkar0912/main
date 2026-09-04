import { describe, expect, it } from "vitest";
import { decodeInboxCursor, encodeInboxCursor } from "./inbox-cursor";

describe("inbox cursor", () => {
  it("round-trips a versioned cursor", () => {
    const encoded = encodeInboxCursor({
      kind: "contacts",
      at: "2026-09-04T10:00:00.000Z",
      id: "contact_1",
    });

    expect(decodeInboxCursor(encoded, "contacts")).toEqual({
      version: 1,
      kind: "contacts",
      at: "2026-09-04T10:00:00.000Z",
      id: "contact_1",
    });
  });

  it.each([
    "not-a-cursor",
    Buffer.from(JSON.stringify({ version: 2, kind: "contacts", at: "2026-09-04T10:00:00.000Z", id: "c1" })).toString("base64url"),
    Buffer.from(JSON.stringify({ version: 1, kind: "contacts", at: "not-a-date", id: "c1" })).toString("base64url"),
    Buffer.from(JSON.stringify({ version: 1, kind: "contacts", at: "2026-09-04T10:00:00.000Z", id: "" })).toString("base64url"),
    Buffer.from(JSON.stringify({ version: 1, kind: "contacts", at: "2026-09-04T10:00:00.000Z", id: "c1", extra: true })).toString("base64url"),
  ])("rejects malformed cursors", (value) => {
    expect(() => decodeInboxCursor(value, "contacts")).toThrow("invalid_cursor");
  });

  it("rejects a cursor from another collection", () => {
    const encoded = encodeInboxCursor({ kind: "messages", at: "2026-09-04T10:00:00.000Z", id: "message_1" });
    expect(() => decodeInboxCursor(encoded, "contacts")).toThrow("invalid_cursor");
  });
});
