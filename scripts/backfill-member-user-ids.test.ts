import { describe, expect, it } from "vitest";

import { backfillMemberUserIds } from "./backfill-member-user-ids.mjs";

describe("backfillMemberUserIds", () => {
  it("matches every normalized membership and remains idempotent", () => {
    const result = backfillMemberUserIds({
      users: [{ id: "u1", email: "Owner@Linkar.in" }],
      members: [
        { id: "m1", email: "owner@linkar.in", userId: null },
        { id: "m2", email: "OWNER@LINKAR.IN", userId: null },
        { id: "m3", email: "owner@linkar.in", userId: "u1" },
      ],
    });

    expect(result.updates).toEqual([{ memberId: "m1", userId: "u1" }, { memberId: "m2", userId: "u1" }]);
    expect(result.alreadyBound).toBe(1);
    expect(result.unmatched).toBe(0);
  });

  it("rejects ambiguous normalized Auth emails", () => {
    expect(() => backfillMemberUserIds({
      users: [{ id: "u1", email: "owner@linkar.in" }, { id: "u2", email: "OWNER@LINKAR.IN" }],
      members: [],
    })).toThrow("ambiguous_auth_email");
  });
});
