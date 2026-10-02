import { expect, it } from "vitest";
import { AuditExportFilterSchema, AuditFilterSchema } from "./query-schema";
it("rejects malformed phases, dates, ranges, limits, and undocumented export fields", () => {
  for (const input of [{ phase: "BOGUS" }, { from: "yesterday" }, { from: "2026-10-02T01:00:00Z", to: "2026-10-01T01:00:00Z" }, { limit: NaN }]) expect(AuditFilterSchema.safeParse(input).success).toBe(false);
  expect(AuditExportFilterSchema.safeParse({ cursor: "abc" }).success).toBe(false);
});
it("accepts empty form filters and compares dates by instant across offsets", () => {
  expect(AuditFilterSchema.parse({ actor: "", action: "", phase: "" })).toMatchObject({ actor: undefined, action: undefined, phase: undefined });
  expect(AuditFilterSchema.safeParse({ from: "2026-10-02T09:00:00+05:30", to: "2026-10-02T04:00:00Z" }).success).toBe(true);
});
