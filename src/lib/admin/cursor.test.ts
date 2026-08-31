import { describe, expect, it } from "vitest";

import { decodeAdminCursor, encodeAdminCursor } from "./cursor";

const SECRET = "cursor-test-secret-at-least-32-characters";

describe("admin cursor", () => {
  it("round-trips a createdAt/id cursor and rejects tampering", () => {
    const value = { createdAt: "2026-08-31T10:00:00.000Z", id: "w1" };
    const cursor = encodeAdminCursor(value, SECRET);

    expect(decodeAdminCursor(cursor, SECRET)).toEqual(value);
    expect(() => decodeAdminCursor(`${cursor}x`, SECRET)).toThrow("invalid_cursor");
  });

  it("rejects malformed and non-ISO cursor payloads", () => {
    expect(() => decodeAdminCursor("not-a-cursor", SECRET)).toThrow("invalid_cursor");
    const cursor = encodeAdminCursor({ createdAt: "not-a-date", id: "w1" }, SECRET);
    expect(() => decodeAdminCursor(cursor, SECRET)).toThrow("invalid_cursor");
  });
});
